/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * A generic floating, draggable toolbar.
 *
 * Completely abstract — knows nothing about segmentation, 3D, or any specific
 * domain. Compose it with `FloatingToolbar.Group` and `FloatingToolbar.Action`
 * to build any tool palette.
 *
 * Designed to be portable to Voodo.
 *
 * @example
 * ```tsx
 * <FloatingToolbar orientation="vertical" defaultPosition={{ x: 5, y: 50 }}>
 *   <FloatingToolbar.Group label="Tool">
 *     <FloatingToolbar.Action active>
 *       <BrushIcon />
 *     </FloatingToolbar.Action>
 *   </FloatingToolbar.Group>
 * </FloatingToolbar>
 * ```
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styled, { css } from "styled-components";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Orientation = "horizontal" | "vertical";

/**
 * Controls which axes the user can drag along.
 *
 * - `"both"` (default) — free movement in x and y
 * - `"x"` — horizontal only
 * - `"y"` — vertical only
 * - `"none"` — fixed, no dragging
 */
type DragAxis = "both" | "x" | "y" | "none";

interface Position {
  /** Horizontal offset as a percentage of the parent width (0–100). */
  x: number;
  /** Vertical offset as a percentage of the parent height (0–100). */
  y: number;
}

export interface FloatingToolbarProps {
  children: React.ReactNode;
  /** Layout direction for groups and actions. Default `"vertical"`. */
  orientation?: Orientation;
  /** Which axes the toolbar can be dragged along. Default `"both"`. */
  dragAxis?: DragAxis;
  /** Initial position as `{ x, y }` percentages. Default `{ x: 5, y: 50 }`. */
  defaultPosition?: Partial<Position>;
  /** Clamp range for each axis as `[min, max]` percentage. Default `[5, 95]`. */
  clamp?: [number, number];
  /** CSS `z-index`. Default 10005. */
  zIndex?: number;
  /** Additional class name. */
  className?: string;
  /** Additional inline styles on the outer container. */
  style?: React.CSSProperties;
  /** Whether the toolbar is visible. Default true. */
  visible?: boolean;
}

export interface FloatingToolbarGroupProps {
  children: React.ReactNode;
  /** Optional label rendered above/before the group. */
  label?: string;
}

export interface FloatingToolbarActionProps {
  children: React.ReactNode;
  /** Whether the action is currently active/selected. */
  active?: boolean;
  /** Whether the action is disabled. */
  disabled?: boolean;
  /** Native title attribute for basic tooltip. Callers can wrap with any
   *  tooltip component they prefer. */
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}

// ---------------------------------------------------------------------------
// Styled primitives
// ---------------------------------------------------------------------------

const orientationStyles = {
  vertical: css`
    flex-direction: column;
  `,
  horizontal: css`
    flex-direction: row;
  `,
};

const Container = styled.div<{
  $isDragging: boolean;
}>`
  position: absolute;
  display: flex;
  background: ${({ theme }) => theme.background.level2};
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.primary.plainBorder};
  box-shadow: ${({ $isDragging }) =>
    $isDragging
      ? "0 4px 16px rgba(0, 0, 0, 0.25)"
      : "0 2px 8px rgba(0, 0, 0, 0.12)"};
  min-width: 36px;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.95 : 0.75)};
  user-select: none;
  transition: ${({ $isDragging }) =>
    $isDragging ? "none" : "opacity 0.2s ease, box-shadow 0.2s ease"};

  &:hover {
    opacity: 0.95;
  }
`;

const DragHandle = styled.div<{
  $orientation: Orientation;
  $isDragging: boolean;
  $hidden: boolean;
}>`
  display: ${({ $hidden }) => ($hidden ? "none" : "flex")};
  align-items: center;
  justify-content: center;
  cursor: ${({ $isDragging }) => ($isDragging ? "grabbing" : "grab")};
  opacity: 0;
  transition: opacity 0.2s ease;
  color: ${({ theme }) => theme.text.secondary};

  ${Container}:hover & {
    opacity: 0.8;
  }

  ${({ $orientation }) =>
    $orientation === "vertical"
      ? css`
          width: 100%;
          height: 12px;
          border-radius: 6px 6px 0 0;
          margin: 2px 2px 0 2px;
          svg {
            transform: rotate(90deg);
          }
        `
      : css`
          height: 100%;
          width: 12px;
          border-radius: 6px 0 0 6px;
          margin: 2px 0 2px 2px;
        `}

  svg {
    font-size: 14px;
  }
`;

const Content = styled.div<{ $orientation: Orientation }>`
  display: flex;
  ${({ $orientation }) => orientationStyles[$orientation]}
  gap: 8px;
  padding: 8px;
`;

const GroupContainer = styled.div<{ $orientation: Orientation }>`
  display: flex;
  ${({ $orientation }) => orientationStyles[$orientation]}
  gap: 6px;
  align-items: center;
`;

const GroupLabel = styled.span`
  font-size: 9px;
  font-weight: 600;
  color: ${({ theme }) => theme.text.secondary};
  text-align: center;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
`;

const ActionContainer = styled.div<{
  $active: boolean;
  $disabled: boolean;
}>`
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  transition: all 0.15s ease;

  color: ${({ $active, $disabled, theme }) =>
    $active
      ? theme.primary.plainColor
      : $disabled
        ? theme.text.tertiary
        : theme.text.secondary};

  background: ${({ $active, theme }) =>
    $active ? theme.background.level1 : "transparent"};

  ${({ $active, theme }) =>
    $active &&
    css`
      svg {
        filter: drop-shadow(0 0 4px ${theme.primary.plainColor});
      }
    `}

  &:hover {
    ${({ $disabled, theme }) =>
      !$disabled &&
      css`
        background: ${theme.background.level1};
        color: ${theme.text.primary};
        transform: scale(1.1);
      `}
  }

  &:active {
    ${({ $disabled }) =>
      !$disabled &&
      css`
        transform: scale(0.95);
      `}
  }

  svg {
    font-size: 18px;
  }
`;

// ---------------------------------------------------------------------------
// Drag handle icon (inline SVG — zero external deps)
// ---------------------------------------------------------------------------

const DragIndicatorSvg = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <circle cx="9" cy="4" r="1.5" />
    <circle cx="15" cy="4" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="15" cy="20" r="1.5" />
  </svg>
);

// ---------------------------------------------------------------------------
// Context (passes orientation to sub-components without prop drilling)
// ---------------------------------------------------------------------------

const OrientationContext = React.createContext<Orientation>("vertical");

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Group: React.FC<FloatingToolbarGroupProps> = ({ children, label }) => {
  const orientation = React.useContext(OrientationContext);
  return (
    <GroupContainer $orientation={orientation}>
      {label && <GroupLabel>{label}</GroupLabel>}
      {children}
    </GroupContainer>
  );
};
Group.displayName = "FloatingToolbar.Group";

const Action: React.FC<FloatingToolbarActionProps> = ({
  children,
  active = false,
  disabled = false,
  title,
  onClick,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      onClick?.(e);
    },
    [disabled, onClick]
  );

  return (
    <ActionContainer
      $active={active}
      $disabled={disabled}
      title={title}
      onClick={handleClick}
    >
      {children}
    </ActionContainer>
  );
};
Action.displayName = "FloatingToolbar.Action";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_POSITION: Position = { x: 5, y: 50 };
const DEFAULT_CLAMP: [number, number] = [5, 95];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FloatingToolbarInner: React.FC<FloatingToolbarProps> = ({
  children,
  orientation = "vertical",
  dragAxis = "both",
  defaultPosition,
  clamp = DEFAULT_CLAMP,
  zIndex = 10005,
  className,
  style,
  visible = true,
}) => {
  const initialPos: Position = {
    ...DEFAULT_POSITION,
    ...defaultPosition,
  };

  const [position, setPosition] = useState<Position>(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ clientX: 0, clientY: 0, pos: initialPos });
  const containerRef = useRef<HTMLDivElement>(null);

  const canDrag = dragAxis !== "none";
  const canDragX = dragAxis === "both" || dragAxis === "x";
  const canDragY = dragAxis === "both" || dragAxis === "y";

  // ---- drag handlers ----

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!canDrag) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        pos: position,
      };
    },
    [canDrag, position]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const parent = containerRef.current?.parentElement;
      const parentW = parent?.clientWidth ?? window.innerWidth;
      const parentH = parent?.clientHeight ?? window.innerHeight;
      const { clientX, clientY, pos } = dragStartRef.current;

      const nextX = canDragX
        ? Math.max(clamp[0], Math.min(clamp[1],
            pos.x + ((e.clientX - clientX) / parentW) * 100))
        : pos.x;

      const nextY = canDragY
        ? Math.max(clamp[0], Math.min(clamp[1],
            pos.y + ((e.clientY - clientY) / parentH) * 100))
        : pos.y;

      setPosition({ x: nextX, y: nextY });
    },
    [canDragX, canDragY, clamp]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // ---- render ----

  if (!visible) return null;

  return (
    <OrientationContext.Provider value={orientation}>
      <Container
        ref={containerRef}
        $isDragging={isDragging}
        className={className}
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          transform: "translate(-50%, -50%)",
          zIndex,
          ...orientationToFlex(orientation),
          ...style,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <DragHandle
          $orientation={orientation}
          $isDragging={isDragging}
          $hidden={!canDrag}
          onMouseDown={handleDragStart}
        >
          <DragIndicatorSvg />
        </DragHandle>
        <Content $orientation={orientation}>{children}</Content>
      </Container>
    </OrientationContext.Provider>
  );
};

function orientationToFlex(o: Orientation): React.CSSProperties {
  return { flexDirection: o === "vertical" ? "column" : "row" };
}

// ---------------------------------------------------------------------------
// Compound component export
// ---------------------------------------------------------------------------

export const FloatingToolbar = Object.assign(FloatingToolbarInner, {
  Group,
  Action,
});
