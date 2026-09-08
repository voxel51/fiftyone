import type React from "react";

/**
 * One independently registered sidebar tray.
 *
 * A tray receives no props. Whether a surface hosts trays at all is the
 * surface's decision, made where the sidebar is built — so a tray never has to
 * interpret facts about where it ended up.
 */
export interface SidebarTrayExtension {
  /** Stable, globally namespaced identity. */
  readonly id: string;
  /** Explicit product-policy order; import order never decides placement. */
  readonly order: number;
  readonly Component: React.ComponentType;
}
