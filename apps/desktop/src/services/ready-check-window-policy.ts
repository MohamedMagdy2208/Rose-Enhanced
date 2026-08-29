import { PRODUCT_NAME } from "@summonerkit/contracts";

export interface ReadyCheckWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
}

export interface ReadyCheckWindowPolicyOptions {
  previousActive: boolean;
  active: boolean;
  window: ReadyCheckWindow | null;
  notify: (title: string, body: string) => void;
}

/**
 * Keep the League client visible when a new ready check starts.
 *
 * The desktop process is intentionally hidden rather than quit: its tray,
 * bridge, LCU connection, automation engine, and mobile channel must remain
 * alive while the user answers in League or on a phone.
 */
export function applyReadyCheckWindowPolicy(options: ReadyCheckWindowPolicyOptions): boolean {
  const started = options.active && !options.previousActive;
  if (started) {
    const window = options.window;
    if (window && !window.isDestroyed() && window.isVisible()) window.hide();
    options.notify(
      "League match found",
      `A ready check is active. ${PRODUCT_NAME} is in the tray so the League client stays visible.`,
    );
  }
  return options.active;
}
