/** Video formats exposed by the Render workspace. */
export type VideoFormat = 'webm' | 'mp4';

const CANDIDATES: Record<VideoFormat, readonly string[]> = {
  webm: [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ],
  mp4: [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ]
};

/** Return the first MediaRecorder MIME type supported by this WebView. */
export function videoMimeFor(format: VideoFormat): string | null {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }
  for (const mime of CANDIDATES[format]) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return null;
}

/** File extension for a supported video format. */
export function videoExtension(format: VideoFormat): string {
  return format;
}

/** Human-readable format name. */
export function videoLabel(format: VideoFormat): string {
  return format === 'webm' ? 'WebM' : 'MP4';
}
