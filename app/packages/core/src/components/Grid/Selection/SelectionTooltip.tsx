import { Tooltip, type TooltipProps } from "@voxel51/voodo";
import styles from "./SelectionTray.module.css";

/** Shared tooltip for tray controls, cards, and action panels. */
export default function SelectionTooltip(
  props: Pick<TooltipProps, "content" | "children" | "wrapperClassName">,
) {
  return <Tooltip {...props} anchor="top" portal className={styles.tooltip} />;
}
