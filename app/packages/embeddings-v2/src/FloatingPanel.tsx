/**
 * Generic floating, draggable, collapsible panel: a header row with a
 * drag grip, title, and collapse chevron; a body; and an optional
 * footer under a hairline. Anchored top-right until first dragged,
 * then positioned in pixels, clamped inside the nearest positioned
 * ancestor (via useDraggable, vendored from @voxel51/voodo). Kept
 * intentionally generic so it can graduate to the design system.
 */
import {
  BackgroundColor,
  BorderColor,
  Button,
  DragHandleIcon,
  getColorCssVar,
  IconColor,
  IconName,
  Size,
  Variant,
} from "@voxel51/voodo";
import {
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import "./panel.css";
import { useDraggable } from "./useDraggable";

const TOKEN_VARS = {
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card2)})`,
  "--emb-card-elevated": `var(${getColorCssVar(BackgroundColor.CardElevated)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-icon-muted": `var(${getColorCssVar(IconColor.Muted)})`,
} as CSSProperties;

/** Panel width 13rem + the 0.75rem inset the overlays use */
const ANCHOR_X = "calc(100% - 13.75rem)";
const ANCHOR_Y = 12;

export interface FloatingPanelProps {
  /** Header label, rendered beside the drag grip */
  title: ReactNode;
  /** Full title as plain text, for the native hover tooltip when the header
   * is truncated (the visible label shows the meaningful tail) */
  titleText?: string;
  /** Muted helper row under a hairline */
  footer?: ReactNode;
  children: ReactNode;
  "aria-label"?: string;
}

export function FloatingPanel({
  title,
  titleText,
  footer,
  children,
  "aria-label": ariaLabel,
}: FloatingPanelProps) {
  const { position, isDragging, containerRef, handleDragStart } = useDraggable({
    initialX: ANCHOR_X,
    initialY: ANCHOR_Y,
  });
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      role="group"
      aria-label={ariaLabel}
      data-dragging={isDragging || undefined}
      className="emb-floating-panel"
      style={{ ...TOKEN_VARS, left: position.x, top: position.y }}
      // The panel floats over the chart: gestures must not reach it
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="emb-floating-panel-header">
        <div
          role="button"
          aria-label="Drag to reposition"
          className="emb-floating-panel-grip"
          onMouseDown={handleDragStart}
        >
          <DragHandleIcon />
        </div>
        <span className="emb-floating-panel-title" title={titleText}>
          {title}
        </span>
        <Button
          variant={Variant.Icon}
          size={Size.Xs}
          leadingIcon={collapsed ? IconName.ChevronTop : IconName.ChevronBottom}
          aria-label={collapsed ? "Expand" : "Collapse"}
          onClick={() => setCollapsed((current) => !current)}
        />
      </div>
      {!collapsed && (
        <>
          <div className="emb-floating-panel-body">{children}</div>
          {footer && <div className="emb-floating-panel-footer">{footer}</div>}
        </>
      )}
    </div>
  );
}
