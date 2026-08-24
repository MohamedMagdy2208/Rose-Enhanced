import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { UpdateService, type DesktopUpdater } from "./update-service";

class UpdaterFixture extends EventEmitter implements DesktopUpdater {
  readonly setFeedURL = vi.fn();
  readonly quitAndInstall = vi.fn();
  readonly checkForUpdates = vi.fn(async () => undefined);
}

function createService(installedWithSquirrel: boolean) {
  const updater = new UpdaterFixture();
  const service = new UpdateService(updater, {
    currentVersion: "0.9.0-beta.1",
    feedUrl: "https://update.example.test/feed",
    installedWithSquirrel,
  });
  return { service, updater };
}

describe("UpdateService", () => {
  it("keeps portable builds honest instead of attempting an unsupported update", async () => {
    const { service, updater } = createService(false);

    expect(await service.check()).toMatchObject({ status: "unavailable", canCheck: false });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("reports an installed build as current after the update feed responds", async () => {
    const { service, updater } = createService(true);
    updater.checkForUpdates.mockImplementation(async () => { updater.emit("update-not-available"); });

    expect(await service.check()).toMatchObject({ status: "current", canCheck: true });
  });

  it("requires an explicit restart after a release finishes downloading", async () => {
    const { service, updater } = createService(true);
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available");
      updater.emit("update-downloaded", {}, "", "v0.9.1");
    });

    expect(await service.check()).toMatchObject({ status: "ready", availableVersion: "0.9.1", canRestart: true });
    service.restart();
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it("surfaces update errors without reporting a successful check", async () => {
    const { service, updater } = createService(true);
    updater.checkForUpdates.mockRejectedValue(new Error("feed unavailable"));

    expect(await service.check()).toMatchObject({ status: "error", message: "Update check failed: feed unavailable" });
  });
});
