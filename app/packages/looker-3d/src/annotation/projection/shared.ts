import styled from "styled-components";
import {
  DEFAULT_OPACITY,
  DESELECTED_OPACITY,
  FALLBACK_COLOR,
  HOVERED_COLOR,
  SELECTED_DASH_ARRAY,
} from "./constants";

/**
 * Svg overlay.
 */
export const OverlaySvg = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
`;

/**
 * Resolves visual properties (color, opacity, strokeDasharray) for a projected
 * annotation based on its interaction state.
 */
export function resolveVisualProps(
  labelColor: string | undefined,
  isSelected: boolean,
  isHovered: boolean,
  isAnyLabelSelected: boolean
): { color: string; opacity: number; strokeDasharray?: string } {
  const color = labelColor ?? FALLBACK_COLOR;

  if (isSelected) {
    return { color, opacity: 1, strokeDasharray: SELECTED_DASH_ARRAY };
  }

  if (isAnyLabelSelected) {
    return { color, opacity: DESELECTED_OPACITY };
  }

  if (isHovered) {
    return { color: HOVERED_COLOR, opacity: 1 };
  }

  return { color, opacity: DEFAULT_OPACITY };
}
