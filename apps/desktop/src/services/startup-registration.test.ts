import { describe, expect, it } from "vitest";
import { createStartupRegistration } from "./startup-registration";

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

  it("quotes a development app path before passing the background flag", () => {
    expect(createStartupRegistration({
      isPackaged: false,
      executablePath: "C:\\Program Files\\Electron\\electron.exe",
      appPath: "E:\\League Tools\\SummonerKit\\apps\\desktop",
      squirrelStubPath: null,
    })).toEqual({
      path: "C:\\Program Files\\Electron\\electron.exe",
      args: ["\"E:\\League Tools\\SummonerKit\\apps\\desktop\"", "--background"],
    });
  });
});
