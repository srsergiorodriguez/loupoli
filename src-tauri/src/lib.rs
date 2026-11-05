use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri_plugin_opener::OpenerExt;

const MAX_PROJECT_BYTES: u64 = 128 * 1024 * 1024;

const PROJECT_HEADER_BYTES: usize = 28;
const PROJECT_MAGIC: &[u8; 8] = b"LPOLY\0\0\0";
const PROJECT_MANIFEST_LIMIT: usize = 16 * 1024 * 1024;

fn align4(value: usize) -> usize {
  (value + 3) & !3
}

fn crc32(bytes: &[u8]) -> u32 {
  let mut crc = 0xffff_ffffu32;
  for byte in bytes {
    crc ^= *byte as u32;
    for _ in 0..8 {
      crc = if (crc & 1) != 0 {
        0xedb8_8320 ^ (crc >> 1)
      } else {
        crc >> 1
      };
    }
  }
  crc ^ 0xffff_ffff
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
  u32::from_le_bytes([
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  ])
}

/// Open an HTTP(S) link with the operating system's default browser.
#[tauri::command]
fn open_external_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
  if !(url.starts_with("https://") || url.starts_with("http://")) {
    return Err("Only http and https links can be opened.".into());
  }
  app
    .opener()
    .open_url(url, None::<&str>)
    .map_err(|error| error.to_string())
}

/// Validate the `.lpoly` envelope and checksum without interpreting the document.
fn validate_project_envelope(bytes: &[u8]) -> Result<(), String> {
  if bytes.len() < PROJECT_HEADER_BYTES {
    return Err("The project file is too short.".into());
  }
  if &bytes[0..8] != PROJECT_MAGIC {
    return Err("The file is not a loupoli .lpoly project.".into());
  }
  let version = u16::from_le_bytes([bytes[8], bytes[9]]);
  if !(1..=4).contains(&version) {
    return Err(format!("Unsupported .lpoly version {version}."));
  }
  let manifest_length = read_u32(bytes, 12) as usize;
  let payload_length = read_u32(bytes, 16) as usize;
  if manifest_length > PROJECT_MANIFEST_LIMIT {
    return Err("The project manifest exceeds the supported limit.".into());
  }
  let payload_start = PROJECT_HEADER_BYTES
    .checked_add(manifest_length)
    .map(align4)
    .ok_or_else(|| "The project header overflows.".to_string())?;
  let expected_length = payload_start
    .checked_add(payload_length)
    .ok_or_else(|| "The project header overflows.".to_string())?;
  if expected_length != bytes.len() {
    return Err("The .lpoly header lengths do not match the file length.".into());
  }
  let expected_crc = read_u32(bytes, 20);
  if crc32(&bytes[PROJECT_HEADER_BYTES..]) != expected_crc {
    return Err("The .lpoly checksum failed; the file may be corrupted.".into());
  }
  Ok(())
}

/// Read a `.lpoly` project as bytes and enforce the same size bound as the UI.
#[tauri::command]
fn read_project_file(path: String) -> Result<Vec<u8>, String> {
  let path = PathBuf::from(path);
  let metadata = fs::metadata(&path).map_err(|error| format!("Cannot read project: {error}"))?;
  if !metadata.is_file() {
    return Err("The selected path is not a file.".into());
  }
  if metadata.len() > MAX_PROJECT_BYTES {
    return Err("The selected project exceeds the 128 MB limit.".into());
  }
  let bytes = fs::read(&path).map_err(|error| format!("Cannot read project: {error}"))?;
  validate_project_envelope(&bytes)?;
  Ok(bytes)
}

/// Read an arbitrary import file without interpreting project semantics.
#[tauri::command]
fn read_import_file(path: String) -> Result<Vec<u8>, String> {
  let destination = PathBuf::from(path);
  let metadata = fs::metadata(&destination)
    .map_err(|error| format!("Cannot inspect import file: {error}"))?;
  if metadata.len() > MAX_PROJECT_BYTES {
    return Err("The selected import exceeds the 128 MB limit.".into());
  }
  fs::read(&destination).map_err(|error| format!("Cannot read import file: {error}"))
}

/// Write an arbitrary export through a same-directory temporary file and rename.
#[tauri::command]
fn write_export_file(path: String, data: Vec<u8>) -> Result<(), String> {
  if data.len() as u64 > MAX_PROJECT_BYTES {
    return Err("The export exceeds the 128 MB limit.".into());
  }
  let destination = PathBuf::from(path);
  let parent = destination
    .parent()
    .filter(|parent| !parent.as_os_str().is_empty())
    .ok_or_else(|| "The export path has no parent directory.".to_string())?;
  if !parent.is_dir() {
    return Err("The export directory does not exist.".into());
  }
  let file_name = destination
    .file_name()
    .ok_or_else(|| "The export path has no file name.".to_string())?
    .to_string_lossy();
  let temp_path = temporary_path(parent, &file_name);
  let result = (|| -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = options
      .open(&temp_path)
      .map_err(|error| format!("Cannot create temporary export file: {error}"))?;
    file
      .write_all(&data)
      .map_err(|error| format!("Cannot write temporary export file: {error}"))?;
    file
      .sync_all()
      .map_err(|error| format!("Cannot flush temporary export file: {error}"))?;
    drop(file);
    match fs::rename(&temp_path, &destination) {
      Ok(()) => Ok(()),
      Err(rename_error) => {
        if destination.exists() {
          fs::remove_file(&destination)
            .map_err(|error| format!("Cannot replace existing export: {error}"))?;
          fs::rename(&temp_path, &destination)
            .map_err(|error| format!("Cannot commit export file: {error}"))
        } else {
          Err(format!("Cannot commit export file: {rename_error}"))
        }
      }
    }
  })();
  if result.is_err() && temp_path.exists() {
    let _ = fs::remove_file(&temp_path);
  }
  result
}

#[tauri::command]
fn write_project_file(path: String, data: Vec<u8>) -> Result<(), String> {
  if data.len() as u64 > MAX_PROJECT_BYTES {
    return Err("The project exceeds the 128 MB limit.".into());
  }
  validate_project_envelope(&data)?;

  let destination = PathBuf::from(path);
  let parent = destination
    .parent()
    .filter(|parent| !parent.as_os_str().is_empty())
    .ok_or_else(|| "The save path has no parent directory.".to_string())?;
  if !parent.is_dir() {
    return Err("The save directory does not exist.".into());
  }
  let file_name = destination
    .file_name()
    .ok_or_else(|| "The save path has no file name.".to_string())?
    .to_string_lossy();
  let temp_path = temporary_path(parent, &file_name);

  let write_result = (|| -> Result<(), String> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = options
      .open(&temp_path)
      .map_err(|error| format!("Cannot create temporary project file: {error}"))?;
    file
      .write_all(&data)
      .map_err(|error| format!("Cannot write temporary project file: {error}"))?;
    file
      .sync_all()
      .map_err(|error| format!("Cannot flush temporary project file: {error}"))?;
    drop(file);

    match fs::rename(&temp_path, &destination) {
      Ok(()) => Ok(()),
      Err(rename_error) => {
        // Windows does not replace an existing destination with `rename`.
        if destination.exists() {
          fs::remove_file(&destination)
            .map_err(|error| format!("Cannot replace existing project: {error}"))?;
          fs::rename(&temp_path, &destination)
            .map_err(|error| format!("Cannot commit project file: {error}"))
        } else {
          Err(format!("Cannot commit project file: {rename_error}"))
        }
      }
    }
  })();

  if write_result.is_err() && temp_path.exists() {
    let _ = fs::remove_file(&temp_path);
  }
  write_result
}

fn temporary_path(parent: &Path, file_name: &str) -> PathBuf {
  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or(0);
  parent.join(format!(".{file_name}.tmp-{}-{stamp}", std::process::id()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      read_project_file,
      read_import_file,
      write_project_file,
      write_export_file,
      open_external_link
    ])
    .run(tauri::generate_context!())
    .expect("error while building loupoli");
}

#[cfg(test)]
mod tests {
  use super::*;

  fn test_path(name: &str) -> PathBuf {
    let stamp = std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|duration| duration.as_nanos())
      .unwrap_or(0);
    std::env::temp_dir().join(format!("loupoli-{name}-{}-{stamp}.lpoly", std::process::id()))
  }

  fn minimal_project() -> Vec<u8> {
    let manifest = br#"{"format":"lpoly","version":1,"settings":{"shading":"unlit","ps1Snap":false,"ps1Affine":false},"nodes":[]}"#;
    let payload_start = align4(PROJECT_HEADER_BYTES + manifest.len());
    let mut bytes = vec![0u8; payload_start];
    bytes[0..8].copy_from_slice(PROJECT_MAGIC);
    bytes[8..10].copy_from_slice(&1u16.to_le_bytes());
    bytes[12..16].copy_from_slice(&(manifest.len() as u32).to_le_bytes());
    bytes[16..20].copy_from_slice(&0u32.to_le_bytes());
    bytes[PROJECT_HEADER_BYTES..PROJECT_HEADER_BYTES + manifest.len()].copy_from_slice(manifest);
    let crc = crc32(&bytes[PROJECT_HEADER_BYTES..]);
    bytes[20..24].copy_from_slice(&crc.to_le_bytes());
    bytes
  }

  #[test]
  fn project_bytes_round_trip_through_atomic_write() {
    let path = test_path("roundtrip");
    let bytes = minimal_project();
    write_project_file(path.to_string_lossy().into_owned(), bytes.clone()).unwrap();
    let read = read_project_file(path.to_string_lossy().into_owned()).unwrap();
    assert_eq!(read, bytes);
    let _ = fs::remove_file(path);
  }

  #[test]
  fn corrupt_projects_are_rejected() {
    let mut bytes = minimal_project();
    let last = bytes.len() - 1;
    bytes[last] ^= 0xff;
    assert!(validate_project_envelope(&bytes).is_err());
  }

  #[test]
  fn missing_save_directory_is_rejected() {
    let path = std::env::temp_dir()
      .join("loupoli-missing-directory")
      .join("nested")
      .join("project.lpoly");
    let result = write_project_file(path.to_string_lossy().into_owned(), minimal_project());
    assert!(result.is_err());
  }

  #[test]
  fn exports_and_imports_arbitrary_bytes() {
    let path = test_path("png-export");
    let bytes = vec![0x89, b'P', b'N', b'G', 0, 1, 2, 3];
    write_export_file(path.to_string_lossy().into_owned(), bytes.clone()).unwrap();
    let read = read_import_file(path.to_string_lossy().into_owned()).unwrap();
    assert_eq!(read, bytes);
    let _ = fs::remove_file(path);
  }
}
