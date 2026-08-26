import { describe, expect, it, vi } from "vitest";
import { applyReadyCheckWindowPolicy } from "./ready-check-window-policy";

function fakeWindow(visible = true) {
  return {
    isDestroyed: () => false,
    isVisible: () => visible,
    hide: vi.fn(),
  };
}

describe("applyReadyCheckWindowPolicy", () => {
  it("hides a visible desktop window and notifies once when a ready check starts", () => {
    const window = fakeWindow();
    const notify = vi.fn();

    const active = applyReadyCheckWindowPolicy({ previousActive: false, active: true, window, notify });

    expect(active).toBe(true);
    expect(window.hide).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      "League match found",
      "A ready check is active. SummonerKit is in the tray so the League client stays visible.",
    );
  });

  it("does not repeat the alert for duplicate active snapshots", () => {
    const window = fakeWindow();
    const notify = vi.fn();

    applyReadyCheckWindowPolicy({ previousActive: false, active: true, window, notify });
    applyReadyCheckWindowPolicy({ previousActive: true, active: true, window, notify });

    expect(window.hide).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("tracks inactive state and leaves an already hidden window alone", () => {
    const window = fakeWindow(false);
    const notify = vi.fn();

    const inactive = applyReadyCheckWindowPolicy({ previousActive: true, active: false, window, notify });
    const active = applyReadyCheckWindowPolicy({ previousActive: false, active: true, window, notify });

    expect(inactive).toBe(false);
    expect(active).toBe(true);
    expect(window.hide).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("does not touch a destroyed window", () => {
    const window = { ...fakeWindow(), isDestroyed: () => true };
    const notify = vi.fn();

    applyReadyCheckWindowPolicy({ previousActive: false, active: true, window, notify });

    expect(window.hide).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
  });
});
