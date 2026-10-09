import { cssVar } from "@voxel51/voodo";
import { useState } from "react";

export const useHighlightHover = (
  disabled: boolean,
  override: null | boolean = null,
  color: null | string = null,
) => {
  const [hovering, setHovering] = useState(false);
  const on =
    typeof override === "boolean"
      ? override && !disabled
      : hovering && !disabled;

  const onMouseEnter = () => setHovering(true);

  const onMouseLeave = () => setHovering(false);

  return {
    style: {
      backgroundColor: on
        ? cssVar.color.bg["card-elevated"]
        : cssVar.color.bg.background,
      color: color
        ? color
        : on
          ? cssVar.color.text.primary
          : cssVar.color.text.secondary,
      cursor: disabled ? "default" : "pointer",
      transition: "background-color 150ms, color 150ms",
    },
    onMouseEnter,
    onMouseLeave,
  };
};
