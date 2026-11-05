/** Return whether the application is running inside the Tauri shell. */
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Open a URL in the system browser.
 *
 * Plain anchor clicks do not leave the Tauri webview reliably. The native
 * opener plugin is used there; browser builds keep the normal new-tab path.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch (error) {
      console.error('Could not open the external link.', error);
    }
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
