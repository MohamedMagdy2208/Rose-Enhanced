import type { ReactNode } from "react";

export function StatusPill({
  tone,
  children,
}: {
  tone: "positive" | "warning" | "danger" | "neutral" | "rose";
  children: ReactNode;
}) {
  return <span className={`status-pill status-pill--${tone}`}>{children}</span>;
}
