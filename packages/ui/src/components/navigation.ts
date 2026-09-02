import {
  Bot,
  BookOpenCheck,
  Boxes,
  ChartNoAxesCombined,
  Dices,
  FlaskConical,
  Gauge,
  PlugZap,
  Settings,
  Smartphone,
  Stethoscope,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export type AppSurface = "desktop" | "client" | "mobile";
export type PageId = "setup" | "dashboard" | "collection" | "insights" | "automation" | "aram" | "integrations" | "mobile" | "doctor" | "testlab" | "guide" | "settings";
export type NavigationGroupId = "league" | "connect" | "system";

export interface NavigationItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
  group: NavigationGroupId;
  desktopOnly?: boolean;
}

export const navigationItems: NavigationItem[] = [
  { id: "dashboard", label: "Overview", icon: Gauge, group: "league" },
  { id: "collection", label: "Collection", icon: Boxes, group: "league" },
  { id: "insights", label: "Coach & Builds", icon: ChartNoAxesCombined, group: "league" },
  { id: "automation", label: "Automation", icon: Bot, group: "league" },
  { id: "aram", label: "ARAM", icon: Dices, group: "league" },
  // The client tab can show mobile status. Pairing secrets, relay setup, and
  // device revocation remain desktop-only within the Mobile Control page.
  { id: "mobile", label: "Mobile Control", icon: Smartphone, group: "connect" },
  { id: "integrations", label: "Integrations", icon: PlugZap, group: "connect", desktopOnly: true },
  { id: "doctor", label: "Connection Doctor", icon: Stethoscope, group: "system", desktopOnly: true },
  { id: "testlab", label: "Test Lab", icon: FlaskConical, group: "system", desktopOnly: true },
  { id: "setup", label: "Setup", icon: WandSparkles, group: "system", desktopOnly: true },
  { id: "guide", label: "Guide & Updates", icon: BookOpenCheck, group: "system", desktopOnly: true },
  { id: "settings", label: "Diagnostics", icon: Settings, group: "system", desktopOnly: true },
];

export const navigationGroups: Array<{ id: NavigationGroupId; label: string }> = [
  { id: "league", label: "League" },
  { id: "connect", label: "Connect" },
  { id: "system", label: "System" },
];

export function navigationForSurface(surface: AppSurface): PageId[] {
  return navigationItems
    .filter((item) => !(item.desktopOnly && surface !== "desktop"))
    .map((item) => item.id);
}

export function navigationGroupsForSurface(surface: AppSurface) {
  const visiblePageIds = new Set(navigationForSurface(surface));
  return navigationGroups
    .map((group) => ({
      id: group.id,
      label: group.label,
      pages: navigationItems.filter((item) => item.group === group.id && visiblePageIds.has(item.id)).map((item) => item.id),
    }))
    .filter((group) => group.pages.length > 0);
}
