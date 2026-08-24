import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

const windowsIcon = path.resolve(__dirname, "assets", "icon.ico");

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "SummonerKit",
    icon: windowsIcon,
    extraResource: ["../client-tab/dist", "../client-tab/pengu", "assets"],
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
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [
        { name: "main_window", config: "vite.renderer.config.ts" },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      strictlyRequireAllFuses: false,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
