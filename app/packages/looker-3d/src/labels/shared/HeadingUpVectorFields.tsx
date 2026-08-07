import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
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
      />
      <FacePickerSection
        title="Up"
        selected={upFace}
        onSelect={onUpChange}
        onHover={onUpFaceHover}
        disabled={disabled}
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
}: {
  title: string;
  selected: CuboidResizeFace | null;
  onSelect: (face: CuboidResizeFace) => void;
  onHover?: (face: CuboidResizeFace | null) => void;
  disabled?: boolean;
}) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
      {title}
    </Text>
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}
    >
      {CUBOID_RESIZE_FACES.map((face) => (
        <Button
          key={face}
          size={Size.Xs}
          disabled={disabled}
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
