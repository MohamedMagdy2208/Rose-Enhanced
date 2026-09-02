import { describe, expect, it } from "vitest";
import {
  createDesktopProtocolRegistration,
  createStartupRegistration,
  shouldOpenForProcessStart,
  shouldStartInBackground,
  startupLaunchStateMatches,
} from "./startup-registration";

describe("Windows startup registration", () => {
  it("uses the Squirrel stub so updates launch the current version", () => {
    expect(createStartupRegistration({
      isPackaged: true,
      executablePath: "C:\\Users\\Mohamed\\AppData\\Local\\SummonerKit\\app-0.11.0\\SummonerKit.exe",
      appPath: "C:\\ignored",
      squirrelStubPath: "C:\\Users\\Mohamed\\AppData\\Local\\SummonerKit\\SummonerKit.exe",
    })).toEqual({
      path: "C:\\Users\\Mohamed\\AppData\\Local\\SummonerKit\\SummonerKit.exe",
      args: ["--background"],
    });
  });

  it("uses the packaged executable for portable builds", () => {
    expect(createStartupRegistration({
      isPackaged: true,
      executablePath: "E:\\SummonerKit\\SummonerKit.exe",
      appPath: "E:\\ignored",
      squirrelStubPath: null,
    })).toEqual({ path: "E:\\SummonerKit\\SummonerKit.exe", args: ["--background"] });
  });

  it("lets Electron quote a development app path before passing the background flag", () => {
    expect(createStartupRegistration({
      isPackaged: false,
      executablePath: "C:\\Program Files\\Electron\\electron.exe",
      appPath: "E:\\League Tools\\SummonerKit\\apps\\desktop",
      squirrelStubPath: null,
    })).toEqual({
      path: "C:\\Program Files\\Electron\\electron.exe",
      args: ["E:\\League Tools\\SummonerKit\\apps\\desktop", "--background"],
    });
  });

  it("lets Electron quote the development path for the custom protocol", () => {
    expect(createDesktopProtocolRegistration({
      isPackaged: false,
      executablePath: "C:\\Program Files\\Electron\\electron.exe",
      appPath: "E:\\League Tools\\SummonerKit\\apps\\desktop",
      squirrelStubPath: null,
    })).toEqual({
      path: "C:\\Program Files\\Electron\\electron.exe",
      args: ["E:\\League Tools\\SummonerKit\\apps\\desktop"],
    });
  });

  it("opens packaged protocol launches in the foreground", () => {
    expect(createDesktopProtocolRegistration({
      isPackaged: true,
      executablePath: "E:\\SummonerKit\\SummonerKit.exe",
      appPath: "E:\\ignored",
      squirrelStubPath: null,
    })).toEqual({ path: "E:\\SummonerKit\\SummonerKit.exe", args: [] });
  });

  it("lets a desktop app link override a stale background argument", () => {
    expect(shouldStartInBackground(["SummonerKit.exe", "--background"])).toBe(true);
    expect(shouldStartInBackground([
      "SummonerKit.exe",
      "--background",
      "summonerkit://open/",
    ])).toBe(false);
    expect(shouldStartInBackground([
      "SummonerKit.exe",
      "--background",
      "summonerkit://other/",
    ])).toBe(true);
    expect(shouldStartInBackground(["SummonerKit.exe"])).toBe(false);
  });

  it("checks whether Windows will launch the executable, independent of exact arguments", () => {
    expect(startupLaunchStateMatches(true, {
      executableWillLaunchAtLogin: true,
    })).toBe(true);
    expect(startupLaunchStateMatches(false, {
      executableWillLaunchAtLogin: true,
    })).toBe(false);
    expect(startupLaunchStateMatches(false, {
      executableWillLaunchAtLogin: false,
    })).toBe(true);
  });

  it("opens only on a newly detected enabled process", () => {
    expect(shouldOpenForProcessStart(true, false, true)).toBe(true);
    expect(shouldOpenForProcessStart(true, true, true)).toBe(false);
    expect(shouldOpenForProcessStart(true, false, false)).toBe(false);
    expect(shouldOpenForProcessStart(false, false, true)).toBe(false);
  });

});
