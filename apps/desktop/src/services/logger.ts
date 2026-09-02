import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { redactSensitive } from "@summonerkit/core";

type LogLevel = "debug" | "info" | "warn" | "error";
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const MAX_RECENT_LINES = 300;

export class AppLogger {
  private readonly recent: string[] = [];
  private readonly filePath: string;
  private writeQueue = Promise.resolve();
  private diskLoggingEnabled = true;
  private diskFailureReported = false;

  constructor() {
    this.filePath = path.join(app.getPath("logs"), "summonerkit.log");
  }

  debug(message: string, data?: unknown): void { this.write("debug", message, data); }
  info(message: string, data?: unknown): void { this.write("info", message, data); }
  warn(message: string, data?: unknown): void { this.write("warn", message, data); }
  error(message: string, data?: unknown): void { this.write("error", message, data); }

  getRecent(): string[] {
    return [...this.recent];
  }

  private write(level: LogLevel, message: string, data?: unknown): void {
    const safeMessage = redactSensitive(message) as string;
    const safeData = data === undefined ? "" : serializeLogData(data);
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${safeMessage}${safeData}`;
    this.recent.push(line);
    if (this.recent.length > MAX_RECENT_LINES) this.recent.shift();
    if (!app.isPackaged && level !== "debug") console[level === "warn" ? "warn" : level === "error" ? "error" : "log"](line);
    if (!this.diskLoggingEnabled) return;
    this.writeQueue = this.writeQueue
      .then(() => this.append(line))
      .catch((error: unknown) => this.reportDiskFailure(error));
  }

  private async append(line: string): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.rotateIfNeeded();
    await appendFile(this.filePath, `${line}\n`, "utf8");
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      if ((await stat(this.filePath)).size < MAX_LOG_BYTES) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    const backupPath = `${this.filePath}.1`;
    await rm(backupPath, { force: true });
    await rename(this.filePath, backupPath);
  }

  private reportDiskFailure(error: unknown): void {
    if (this.diskFailureReported) return;
    this.diskLoggingEnabled = false;
    this.diskFailureReported = true;
    const warning = `${new Date().toISOString()} WARN File logging disabled ${String(redactSensitive(String(error)))}`;
    this.recent.push(warning);
    if (this.recent.length > MAX_RECENT_LINES) this.recent.shift();
  }
}

function serializeLogData(data: unknown): string {
  try {
    const serialized = JSON.stringify(redactSensitive(data));
    return typeof serialized === "string" ? ` ${serialized}` : " [unserializable]";
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) return " [unserializable]";
    throw error;
  }
}
