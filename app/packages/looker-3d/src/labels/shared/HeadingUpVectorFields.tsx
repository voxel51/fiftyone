import {
  Anchor,
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import type { ReactNode } from "react";
import {
  CUBOID_RESIZE_FACES,
  getCuboidResizeFaceAxis,
  type CuboidResizeFace,
} from "../../annotation/cuboid-face-resize";
import { ORIENTATION_AXES_COLORS } from "./CuboidOrientationMarkers";

// Matches the axis colors drawn by the centroid axes gizmo (CuboidAxesMarker):
// +X red, +Y green, +Z blue — so "up" here can be described the same way the
// gizmo shows it in the 3D view.
const AXIS_COLOR_NAMES = ["Red", "Green", "Blue"] as const;
const AXIS_COLORS = [
  ORIENTATION_AXES_COLORS.x,
  ORIENTATION_AXES_COLORS.y,
  ORIENTATION_AXES_COLORS.z,
] as const;

const FACE_LABELS: Record<CuboidResizeFace, string> = {
  "+x": "+X",
  "-x": "−X",
  "+y": "+Y",
  "-y": "−Y",
  "+z": "+Z",
  "-z": "−Z",
};

// Heading is always the box's local X axis and isn't user-editable here — up
// must be on a different axis, so ±X can never be a valid "up" pick. Omitted
// entirely rather than disabled since there's no single fixed face to anchor
// an explanation to.
const UP_EXCLUDED_FACES: readonly CuboidResizeFace[] = ["+x", "-x"];

export interface HeadingUpVectorFieldsProps {
  upFace: CuboidResizeFace;
  onUpChange: (face: CuboidResizeFace) => void;
  /** Fires as the pointer enters/leaves an up face button (`null` on leave). */
  onUpFaceHover?: (face: CuboidResizeFace | null) => void;
  /**
   * Fires as the pointer enters/leaves this component as a whole (not a
   * specific button) — for suppressing other controls without them
   * flickering back on in the gaps between buttons. See `onUpFaceHover` for
   * the per-face hover instead.
   */
  onHoverActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}

/**
 * The up-vector face picker, shown inline in the annotation sidebar. Doesn't
 * render any Apply/Cancel chrome; callers decide whether picks apply
 * immediately or need a confirm step.
 */
export const HeadingUpVectorFields = ({
  upFace,
  onUpChange,
  onUpFaceHover,
  onHoverActiveChange,
  disabled = false,
}: HeadingUpVectorFieldsProps) => {
  const upAxis = getCuboidResizeFaceAxis(upFace).axis;
  const upColorName = AXIS_COLOR_NAMES[upAxis];
  const upColor = AXIS_COLORS[upAxis];

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={() => onHoverActiveChange?.(true)}
      onMouseLeave={() => onHoverActiveChange?.(false)}
    >
      <FacePickerSection
        title="Up"
        selected={upFace}
        onSelect={onUpChange}
        onHover={onUpFaceHover}
        disabled={disabled}
        excludeFaces={UP_EXCLUDED_FACES}
        infoTooltip={
          <>
            Up vector is{" "}
            <Text
              variant={TextVariant.Xs}
              style={{ color: upColor, display: "inline" }}
            >
              {upColorName}
            </Text>
            , matching the axes gizmo shown on the box.
          </>
        }
      />
    </div>
  );
};

const FacePickerSection = ({
  title,
  selected,
  onSelect,
  onHover,
  disabled,
  disabledFaces,
  excludeFaces,
  infoTooltip,
}: {
  title: string;
  selected: CuboidResizeFace | null;
  onSelect: (face: CuboidResizeFace) => void;
  onHover?: (face: CuboidResizeFace | null) => void;
  disabled?: boolean;
  /** Faces still shown, but not selectable — e.g. heading's fixed +X. */
  disabledFaces?: readonly CuboidResizeFace[];
  /** Faces omitted from the grid entirely — e.g. up's structurally-invalid ±X. */
  excludeFaces?: readonly CuboidResizeFace[];
  infoTooltip?: ReactNode;
}) => {
  const faces = excludeFaces
    ? CUBOID_RESIZE_FACES.filter((face) => !excludeFaces.includes(face))
    : CUBOID_RESIZE_FACES;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          {title}
        </Text>
        {infoTooltip && (
          <Tooltip
            content={<Text variant={TextVariant.Xs}>{infoTooltip}</Text>}
            anchor={Anchor.Top}
            portal
          >
            <Icon name={IconName.Info} size={Size.Sm} />
          </Tooltip>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(faces.length, 3)}, 1fr)`,
          gap: 4,
        }}
      >
        {faces.map((face) => (
          <Button
            key={face}
            size={Size.Xs}
            disabled={disabled || disabledFaces?.includes(face)}
            variant={face === selected ? Variant.Primary : Variant.Secondary}
            onClick={() => onSelect(face)}
            onMouseEnter={() => onHover?.(face)}
            onMouseLeave={() => onHover?.(null)}
          >
            {FACE_LABELS[face]}
          </Button>
        ))}
      </div>
    </div>
  );
};
