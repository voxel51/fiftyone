import React from "react";
import { useSidebarTrayExtensions } from "../../../extensions/sidebar-tray";
import RightSidebar from "./RightSidebar";
import useMountedOnceOpen from "./useMountedOnceOpen";

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
