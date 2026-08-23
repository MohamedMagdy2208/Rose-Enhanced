import type { CompanionBridge } from "@rose-enhanced/contracts";

declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
  const MAIN_WINDOW_VITE_NAME: string;

  interface Window {
    roseEnhanced: CompanionBridge;
  }
}

export {};
