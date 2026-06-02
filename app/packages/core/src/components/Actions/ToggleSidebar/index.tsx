import { sidebarVisible } from "@fiftyone/state";
import {
  BackgroundColor,
  Icon,
  IconName,
  Pill,
  Size,
  TextColor,
  Tooltip,
} from "@voxel51/voodo";
import React from "react";
import { useRecoilState } from "recoil";
import type { ActionProps } from "../types";

// Tactile press feedback. Matches the header's icon affordances so
// every clickable in the grid chrome feels consistent.
const PRESS_CLASS =
  "cursor-pointer hover:scale-[1.06] active:scale-[0.94] transition-transform duration-[150ms] ease-out";

const TOOLTIP_CLASS =
  "!bg-black/70 !text-white backdrop-blur-sm whitespace-nowrap";

const ToggleSidebar = React.forwardRef<
  HTMLSpanElement,
  ActionProps & {
    modal: boolean;
  }
>(({ modal }, ref) => {
  const [visible, setVisible] = useRecoilState(sidebarVisible(modal));

  // Chevron direction depends on whether we're in the modal (where
  // the sidebar lives on the right) or the grid (where it lives on
  // the left). The icon shown is the action the click WILL perform —
  // pointing inward when shown, outward when hidden.
  const iconName = visible
    ? modal
      ? IconName.ChevronRight
      : IconName.ChevronLeft
    : modal
    ? IconName.ChevronLeft
    : IconName.ChevronRight;

  return (
    <Tooltip
      content={`${visible ? "Hide" : "Show"} sidebar (s)`}
      className={TOOLTIP_CLASS}
      portal
    >
      <Pill
        ref={ref}
        size={Size.Xs}
        backgroundColor={
          visible ? BackgroundColor.Muted : BackgroundColor.Card2
        }
        color={visible ? TextColor.Muted : TextColor.Primary}
        className={PRESS_CLASS}
        onClick={() => setVisible(!visible)}
        data-cy="action-toggle-sidebar"
      >
        <Icon name={iconName} size={Size.Sm} />
      </Pill>
    </Tooltip>
  );
});

export default ToggleSidebar;
