import React, { useEffect, useState } from "react";
import { useSidebarTrayExtensions } from "../../../extensions/sidebar-tray";
import RightSidebar from "./RightSidebar";

export interface RightSidebarWithTraysProps {
  /**
   * Whether the containing drawer is open. The drawer renders its children
   * either way, so without this a tray would do its mount-time work — fetches,
   * subscriptions — for a region the user has never revealed.
   */
  readonly sidebarOpen?: boolean;
}

/**
 * The right sidebar for a surface that hosts registered trays.
 *
 * Opting in is the surface's choice: the grid-surface MCAP Explorer plays a
 * local file with no dataset sample behind it, so it renders the plain
 * {@link RightSidebar} instead of this one.
 */
const RightSidebarWithTrays: React.FC<RightSidebarWithTraysProps> = ({
  sidebarOpen = true,
}) => {
  const trays = useSidebarTrayExtensions();
  const mounted = useMountedOnceOpen(sidebarOpen);

  if (!mounted || trays.length === 0) return <RightSidebar />;

  return (
    <RightSidebar
      tray={trays.map(({ Component, id }) => (
        <Component key={id} />
      ))}
    />
  );
};

export default RightSidebarWithTrays;

/**
 * Latches true the first time `open` is true, and stays true.
 *
 * A tray behind a closed drawer shouldn't do mount-time work until the drawer
 * is revealed, but must not be discarded when it closes again — losing a draft
 * or refetching on every reopen. Mount on first open; stay mounted.
 */
function useMountedOnceOpen(open: boolean): boolean {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return mounted;
}
