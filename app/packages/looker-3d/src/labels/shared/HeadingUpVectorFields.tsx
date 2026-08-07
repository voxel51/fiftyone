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
  type CuboidResizeFace,
} from "../../annotation/cuboid-face-resize";
import { isValidHeadingUpFacePair } from "../../annotation/cuboid-heading-relabel";

const FACE_LABELS: Record<CuboidResizeFace, string> = {
  "+x": "+X",
  "-x": "−X",
  "+y": "+Y",
  "-y": "−Y",
  "+z": "+Z",
  "-z": "−Z",
};

// The committed heading is always local +X (see `HEADING_FORWARD_FACE` in
// `cuboid-orientation-geometry.ts`) — relabeling doesn't move the arrow, it
// changes which face of the box *is* +X. So this button can't be picked away
// from itself; disabled (rather than omitted) so its position stays stable
// and the info tooltip below has something to explain.
const HEADING_DISABLED_FACES: readonly CuboidResizeFace[] = ["+x"];

// Heading always occupies the box's X axis (see above), and heading/up must
// be on different axes (`isValidHeadingUpFacePair`) — so +X/-X can never be a
// valid "up" pick. Omitted entirely rather than disabled, since unlike the
// heading button there's no single fixed face to anchor an explanation to.
const UP_EXCLUDED_FACES: readonly CuboidResizeFace[] = ["+x", "-x"];

export interface HeadingUpVectorFieldsProps {
  headingFace: CuboidResizeFace;
  upFace: CuboidResizeFace;
  onHeadingChange: (face: CuboidResizeFace) => void;
  onUpChange: (face: CuboidResizeFace) => void;
  /** Fires as the pointer enters/leaves a heading face button (`null` on leave). */
  onHeadingFaceHover?: (face: CuboidResizeFace | null) => void;
  /** Fires as the pointer enters/leaves an up face button (`null` on leave). */
  onUpFaceHover?: (face: CuboidResizeFace | null) => void;
  /**
   * Fires as the pointer enters/leaves this component as a whole (not a
   * specific button) — for suppressing other controls without them
   * flickering back on in the gaps between buttons. See
   * `onHeadingFaceHover`/`onUpFaceHover` for the per-face hover instead.
   */
  onHoverActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}

/**
 * The heading/up face pickers plus the same-axis validation warning, shown
 * inline in the annotation sidebar. Doesn't render any Apply/Cancel chrome;
 * callers decide whether picks apply immediately or need a confirm step.
 */
export const HeadingUpVectorFields = ({
  headingFace,
  upFace,
  onHeadingChange,
  onUpChange,
  onHeadingFaceHover,
  onUpFaceHover,
  onHoverActiveChange,
  disabled = false,
}: HeadingUpVectorFieldsProps) => {
  const isValid = isValidHeadingUpFacePair(headingFace, upFace);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 12 }}
      onMouseEnter={() => onHoverActiveChange?.(true)}
      onMouseLeave={() => onHoverActiveChange?.(false)}
    >
      <FacePickerSection
        title="Heading"
        selected={headingFace}
        onSelect={onHeadingChange}
        onHover={onHeadingFaceHover}
        disabled={disabled}
        disabledFaces={HEADING_DISABLED_FACES}
        infoTooltip="+X is always the heading. Changing this changes which face is actually +X."
      />
      <FacePickerSection
        title="Up"
        selected={upFace}
        onSelect={onUpChange}
        onHover={onUpFaceHover}
        disabled={disabled}
        excludeFaces={UP_EXCLUDED_FACES}
      />

      {!isValid && (
        <Text variant={TextVariant.Xs} color={TextColor.Destructive}>
          Heading and up must be on different axes.
        </Text>
      )}
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
