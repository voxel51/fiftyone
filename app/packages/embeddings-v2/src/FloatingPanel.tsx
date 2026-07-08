/**
 * Generic floating, draggable, collapsible panel — the shell of the
 * lovable legend, and an upstream candidate for VOODO (Toolbar's drag
 * handle is a fixed strip with double-click collapse; this puts the
 * grip inline in a header row with an explicit chevron and a footer
 * slot). Anchors top-right until first dragged, then follows the
 * pointer, clamped inside its positioned parent by useDraggable (the
 * VOODO util, vendored until the library exports it).
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
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-icon-muted": `var(${getColorCssVar(IconColor.Muted)})`,
} as CSSProperties;

/** Panel width 13rem + the 0.75rem inset the overlays use */
const ANCHOR_X = "calc(100% - 13.75rem)";
const ANCHOR_Y = 12;

export interface FloatingPanelProps {
  /** Header label, rendered beside the drag grip */
  title: ReactNode;
  /** Muted helper row under a hairline */
  footer?: ReactNode;
  children: ReactNode;
  "aria-label"?: string;
}

export function FloatingPanel({
  title,
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
        <span className="emb-floating-panel-title">{title}</span>
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
