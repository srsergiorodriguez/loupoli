//! Native H.264 MP4 writing for Apple platforms.
//!
//! The webview sends one JPEG or PNG frame at a time over Tauri's raw binary
//! IPC. AVFoundation decodes it into a BGRA pixel buffer and appends it to a
//! single MPEG-4 writer. Other targets report the capability as unavailable and
//! the frontend falls back to the WebView recorder.

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

struct Mp4Session {
  handle: usize,
  path: PathBuf,
}

/// Active native MP4 sessions, keyed by the opaque frontend session id.
#[derive(Default)]
pub struct Mp4Sessions {
  next_id: AtomicU64,
  writers: Mutex<HashMap<String, Mp4Session>>,
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
unsafe extern "C" {
  fn loupoli_mp4_create(
    path: *const c_char,
    width: c_int,
    height: c_int,
    fps: c_int,
    error: *mut *mut c_char,
  ) -> *mut c_void;
  fn loupoli_mp4_append(
    handle: *mut c_void,
    data: *const u8,
    length: usize,
    error: *mut *mut c_char,
  ) -> c_int;
  fn loupoli_mp4_finish(handle: *mut c_void, error: *mut *mut c_char) -> c_int;
  fn loupoli_mp4_mux_audio(
    video_path: *const c_char,
    audio_path: *const c_char,
    output_path: *const c_char,
    start_seconds: f64,
    offset_seconds: f64,
    duration_seconds: f64,
    gain: f64,
    error: *mut *mut c_char,
  ) -> c_int;
  fn loupoli_mp4_cancel(handle: *mut c_void);
  fn loupoli_mp4_release(handle: *mut c_void);
  fn loupoli_mp4_free_error(error: *mut c_char);
}

/// Native MP4 writing is currently available through AVFoundation only.
pub fn available() -> bool {
  cfg!(any(target_os = "macos", target_os = "ios"))
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
unsafe fn take_error(error: *mut c_char) -> String {
  if error.is_null() {
    return "Native MP4 encoding failed.".to_string();
  }
  let message = unsafe { CStr::from_ptr(error) }
    .to_string_lossy()
    .into_owned();
  unsafe { loupoli_mp4_free_error(error) };
  message
}

impl Mp4Sessions {
  /// Start one native MP4 writer and return its opaque session id.
  pub fn begin(&self, path: String, width: u32, height: u32, fps: u32) -> Result<String, String> {
    if !available() {
      return Err("Native MP4 encoding is unavailable on this platform.".into());
    }
    if !(2..=4096).contains(&width)
      || !(2..=4096).contains(&height)
      || width % 2 != 0
      || height % 2 != 0
      || !(1..=120).contains(&fps)
    {
      return Err("MP4 output requires even dimensions between 2 and 4096 and 1–120 fps.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
      let destination = PathBuf::from(&path);
      let path = CString::new(path).map_err(|_| "The MP4 path is invalid.".to_string())?;
      let mut error: *mut c_char = std::ptr::null_mut();
      let handle = unsafe {
        loupoli_mp4_create(
          path.as_ptr(),
          width as c_int,
          height as c_int,
          fps as c_int,
          &mut error,
        )
      };
      if handle.is_null() {
        let _ = std::fs::remove_file(&destination);
        return Err(unsafe { take_error(error) });
      }
      let id = format!("mp4-{}", self.next_id.fetch_add(1, Ordering::Relaxed) + 1);
      self
        .writers
        .lock()
        .map_err(|_| "The MP4 session lock failed.".to_string())?
        .insert(
          id.clone(),
          Mp4Session {
            handle: handle as usize,
            path: destination,
          },
        );
      return Ok(id);
    }
    #[allow(unreachable_code)]
    Err("Native MP4 encoding is unavailable on this platform.".into())
  }

  /// Append one encoded JPEG/PNG frame.
  pub fn append(&self, id: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
      return Err("The MP4 frame is empty.".into());
    }
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
      let writers = self
        .writers
        .lock()
        .map_err(|_| "The MP4 session lock failed.".to_string())?;
      let handle = writers
        .get(id)
        .map(|session| session.handle)
        .ok_or_else(|| "The MP4 session is no longer active.".to_string())?;
      let mut error: *mut c_char = std::ptr::null_mut();
      let result = unsafe {
        loupoli_mp4_append(
          handle as *mut c_void,
          bytes.as_ptr(),
          bytes.len(),
          &mut error,
        )
      };
      return if result == 0 {
        Ok(())
      } else {
        Err(unsafe { take_error(error) })
      };
    }
    #[allow(unreachable_code)]
    Err("Native MP4 encoding is unavailable on this platform.".into())
  }

  /// Finalize the MP4 and release its native writer.
  pub fn finish(&self, id: &str) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
      let session = self
        .writers
        .lock()
        .map_err(|_| "The MP4 session lock failed.".to_string())?
        .remove(id)
        .ok_or_else(|| "The MP4 session is no longer active.".to_string())?;
      let mut error: *mut c_char = std::ptr::null_mut();
      let result = unsafe { loupoli_mp4_finish(session.handle as *mut c_void, &mut error) };
      unsafe { loupoli_mp4_release(session.handle as *mut c_void) };
      if result != 0 {
        let _ = std::fs::remove_file(&session.path);
        return Err(unsafe { take_error(error) });
      }
      // AVAssetWriter can finalize a zero-byte file if no frame ever reached
      // the writer. Never leave that file behind as if the export succeeded.
      let size = std::fs::metadata(&session.path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
      if size == 0 {
        let _ = std::fs::remove_file(&session.path);
        return Err(
          "AVFoundation finalized an empty MP4. No frames were encoded.".into(),
        );
      }
      return Ok(());
    }
    #[allow(unreachable_code)]
    Err("Native MP4 encoding is unavailable on this platform.".into())
  }

  /// Abort and release one native writer.
  pub fn cancel(&self, id: &str) {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
      if let Ok(mut writers) = self.writers.lock() {
        if let Some(session) = writers.remove(id) {
          unsafe { loupoli_mp4_cancel(session.handle as *mut c_void) };
          let _ = std::fs::remove_file(&session.path);
        }
      }
    }
  }
}

/// Mux one audio source into an existing native MP4 and replace the video file.
pub fn mux_audio(
  video_path: String,
  audio_path: String,
  start: f64,
  duration: f64,
  offset: f64,
  gain: f64,
) -> Result<(), String> {
  if !available() {
    return Err("Native MP4 audio muxing is unavailable on this platform.".into());
  }
  if !start.is_finite()
    || !duration.is_finite()
    || !offset.is_finite()
    || !gain.is_finite()
    || start < 0.0
    || duration <= 0.0
    || offset < 0.0
    || !(0.0..=2.0).contains(&gain)
  {
    return Err("The MP4 audio mux timing is invalid.".into());
  }
  #[cfg(any(target_os = "macos", target_os = "ios"))]
  {
    let video = PathBuf::from(&video_path);
    let parent = video
      .parent()
      .filter(|path| !path.as_os_str().is_empty())
      .ok_or_else(|| "The MP4 path has no parent directory.".to_string())?;
    let stamp = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|value| value.as_nanos())
      .unwrap_or(0);
    let output = parent.join(format!(
      ".loupoli-mux-{}-{stamp}.mp4",
      std::process::id()
    ));
    let video_text = CString::new(video_path).map_err(|_| "The MP4 path is invalid.".to_string())?;
    let audio_text = CString::new(audio_path.clone()).map_err(|_| "The audio path is invalid.".to_string())?;
    let output_text = CString::new(output.to_string_lossy().into_owned())
      .map_err(|_| "The MP4 mux path is invalid.".to_string())?;
    let mut error: *mut c_char = std::ptr::null_mut();
    let result = unsafe {
      loupoli_mp4_mux_audio(
        video_text.as_ptr(),
        audio_text.as_ptr(),
        output_text.as_ptr(),
        start,
        offset,
        duration,
        gain,
        &mut error,
      )
    };
    let _ = std::fs::remove_file(&audio_path);
    if result != 0 {
      let _ = std::fs::remove_file(&output);
      return Err(unsafe { take_error(error) });
    }
    std::fs::rename(&output, &video).map_err(|error| {
      let _ = std::fs::remove_file(&output);
      format!("The muxed MP4 could not replace the video: {error}")
    })?;
    return Ok(());
  }
  #[allow(unreachable_code)]
  Err("Native MP4 audio muxing is unavailable on this platform.".into())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn writes_a_native_mp4_from_jpeg_frames() {
    if !available() {
      return;
    }
    let path = std::env::temp_dir().join(format!(
      "loupoli-native-mp4-{}-{}.mp4",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0)
    ));
    let sessions = Mp4Sessions::default();
    let session = sessions
      .begin(path.to_string_lossy().into_owned(), 64, 64, 24)
      .expect("start native MP4");
    let frame = include_bytes!("../native/test-frame.jpg");
    for _ in 0..3 {
      sessions.append(&session, frame).expect("append frame");
    }
    sessions.finish(&session).expect("finish native MP4");
    let metadata = std::fs::metadata(&path).expect("MP4 exists");
    assert!(metadata.len() > 100);
    println!("NATIVE_MP4_PATH={}", path.display());
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn muxes_audio_into_a_native_mp4() {
    if !available() {
      return;
    }
    let path = std::env::temp_dir().join(format!(
      "loupoli-native-mp4-audio-{}-{}.mp4",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0)
    ));
    let audio_path = path.with_extension("wav");
    let sessions = Mp4Sessions::default();
    let session = sessions
      .begin(path.to_string_lossy().into_owned(), 64, 64, 24)
      .expect("start native MP4");
    let frame = include_bytes!("../native/test-frame.jpg");
    for _ in 0..6 {
      sessions.append(&session, frame).expect("append frame");
    }
    sessions.finish(&session).expect("finish native MP4");
    let sample_rate = 44_100u32;
    let sample_count = sample_rate / 10;
    let data_bytes = sample_count * 2;
    let mut wav = Vec::with_capacity(44 + data_bytes as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_bytes).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_bytes.to_le_bytes());
    wav.resize(44 + data_bytes as usize, 0);
    std::fs::write(&audio_path, &wav).expect("write test wav");
    mux_audio(
      path.to_string_lossy().into_owned(),
      audio_path.to_string_lossy().into_owned(),
      0.0,
      0.1,
      0.0,
      1.0,
    )
    .expect("mux audio into MP4");
    let metadata = std::fs::metadata(&path).expect("muxed MP4 exists");
    assert!(metadata.len() > 100);
    assert!(!audio_path.exists());
    println!("NATIVE_MP4_AUDIO_PATH={}", path.display());
    let _ = std::fs::remove_file(path);
  }

  #[test]
  fn cancelling_a_native_mp4_removes_the_partial_file() {
    if !available() {
      return;
    }
    let path = std::env::temp_dir().join(format!(
      "loupoli-native-mp4-cancel-{}-{}.mp4",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0)
    ));
    let sessions = Mp4Sessions::default();
    let session = sessions
      .begin(path.to_string_lossy().into_owned(), 64, 64, 24)
      .expect("start native MP4");
    sessions
      .append(&session, include_bytes!("../native/test-frame.jpg"))
      .expect("append frame");
    sessions.cancel(&session);
    assert!(!path.exists());
  }
}
