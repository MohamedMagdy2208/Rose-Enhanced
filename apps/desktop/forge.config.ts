import { access, copyFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { flipFuses, FuseV1Options, FuseVersion } from "@electron/fuses";

const windowsIcon = path.resolve(__dirname, "assets", "icon.ico");
const clientDistSource = path.resolve(__dirname, "../client-tab/dist");
const clientPluginTemplateSource = path.resolve(__dirname, "../client-tab/pengu/index.template.js");

async function stageIntegrityProtectedClientAssets(buildPath: string): Promise<void> {
  await access(path.join(clientDistSource, "index.html"));
  await access(clientPluginTemplateSource);
  await cp(clientDistSource, path.join(buildPath, "client-dist"), { recursive: true });
  const pluginDirectory = path.join(buildPath, "client-plugin");
  await mkdir(pluginDirectory, { recursive: true });
  await copyFile(clientPluginTemplateSource, path.join(pluginDirectory, "index.template.js"));
}

async function hardenElectronBinary(buildPath: string): Promise<void> {
  await flipFuses(path.resolve(buildPath, "../..", "electron.exe"), {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    [FuseV1Options.WasmTrapHandlers]: false,
  });
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "SummonerKit",
    icon: windowsIcon,
    extraResource: [
      "assets",
      "../../LICENSE",
      "../../NOTICE.md",
      "../../COPYRIGHT.md",
      "../../THIRD_PARTY_NOTICES.md",
    ],
  },
  hooks: {
    packageAfterCopy: async (_forgeConfig, buildPath, _electronVersion, platform) => {
      if (platform !== "win32") throw new Error("SummonerKit packaging currently supports Windows only.");
      await stageIntegrityProtectedClientAssets(buildPath);
      await hardenElectronBinary(buildPath);
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "summonerkit",
      setupExe: "SummonerKit-win32-x64-Setup.exe",
      setupIcon: windowsIcon,
      authors: "Mohamed Magdy",
      copyright: "Copyright © 2026 Mohamed Magdy",
      description: "A privacy-first Windows companion for League of Legends.",
    }),
    new MakerZIP({}, ["win32"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.mts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.mts", target: "preload" },
      ],
      renderer: [
        { name: "main_window", config: "vite.renderer.config.mts" },
      ],
    }),
  ],
};

export default config;
