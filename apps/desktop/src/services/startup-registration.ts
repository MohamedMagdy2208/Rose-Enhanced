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
  return { path: context.executablePath, args: [quoteWindowsArgument(context.appPath), "--background"] };
}

function quoteWindowsArgument(value: string): string {
  return value.includes(" ") ? `"${value.replaceAll('"', '\\"')}"` : value;
}
