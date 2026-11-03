/** One keyboard handler in the shared shortcut dispatch chain. */
export type ShortcutHandler = (event: KeyboardEvent) => void;

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  );
}

/**
 * One window-level keyboard entry point.
 *
 * Handlers run in registration order and may claim an event with
 * `preventDefault()`. This replaces component-specific capture/bubble
 * listeners and gives global, 3D, and UV shortcuts a single dispatch order.
 */
class ShortcutBus {
  private readonly handlers: ShortcutHandler[] = [];
  private listening = false;

  /** Register a handler and return its cleanup function. */
  register(handler: ShortcutHandler): () => void {
    this.handlers.push(handler);
    this.install();
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index >= 0) {
        this.handlers.splice(index, 1);
      }
      if (this.handlers.length === 0) {
        this.uninstall();
      }
    };
  }

  private readonly dispatch = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) {
      return;
    }
    for (const handler of [...this.handlers]) {
      handler(event);
      if (event.defaultPrevented) {
        return;
      }
    }
  };

  private install(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    window.addEventListener('keydown', this.dispatch);
  }

  private uninstall(): void {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    window.removeEventListener('keydown', this.dispatch);
  }
}

/** Shared keyboard dispatcher for the application. */
export const shortcutBus = new ShortcutBus();
