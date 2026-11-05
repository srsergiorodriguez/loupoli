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
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_external_link', { url });
      return;
    } catch (commandError) {
      console.error('Could not open the external link through the app command.', commandError);
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
      } catch (pluginError) {
        console.error('Could not open the external link through the opener plugin.', pluginError);
      }
    }
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
