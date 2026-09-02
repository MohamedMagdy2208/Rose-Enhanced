import { DESKTOP_LAUNCH_PROTOCOL_SCHEME } from "@summonerkit/contracts";

export interface StartupRegistrationContext {
  isPackaged: boolean;
  executablePath: string;
  appPath: string;
  squirrelStubPath: string | null;
}

export interface StartupRegistration {
  path: string;
  args: string[];
}

export function createStartupRegistration(context: StartupRegistrationContext): StartupRegistration {
  if (context.isPackaged && context.squirrelStubPath) {
    return { path: context.squirrelStubPath, args: ["--background"] };
  }
  if (context.isPackaged) return { path: context.executablePath, args: ["--background"] };
  return { path: context.executablePath, args: [context.appPath, "--background"] };
}

export function createDesktopProtocolRegistration(
  context: StartupRegistrationContext,
): StartupRegistration {
  if (context.isPackaged && context.squirrelStubPath) {
    return { path: context.squirrelStubPath, args: [] };
  }
  if (context.isPackaged) return { path: context.executablePath, args: [] };
  return { path: context.executablePath, args: [context.appPath] };
}

export function shouldStartInBackground(argumentsList: readonly string[]): boolean {
  return argumentsList.includes("--background")
    && !argumentsList.some(isDesktopLaunchArgument);
}

export function startupLaunchStateMatches(
  enabled: boolean,
  state: { executableWillLaunchAtLogin: boolean },
): boolean {
  return state.executableWillLaunchAtLogin === enabled;
}

export function shouldOpenForProcessStart(
  enabled: boolean,
  wasRunning: boolean,
  isRunning: boolean,
): boolean {
  return enabled && !wasRunning && isRunning;
}

function isDesktopLaunchArgument(argument: string): boolean {
  try {
    const url = new URL(argument);
    return url.protocol === `${DESKTOP_LAUNCH_PROTOCOL_SCHEME}:`
      && url.hostname === "open"
      && (url.pathname === "" || url.pathname === "/")
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}
