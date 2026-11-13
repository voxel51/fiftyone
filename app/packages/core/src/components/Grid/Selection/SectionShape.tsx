import type { SelectionBucketIcon } from "@fiftyone/state/src/selection";
import {
  CheckIcon,
  CircleOutlinedIcon,
  CloseIcon,
  CropSquareIcon,
  RemoveIcon,
  type IconProps,
} from "@voxel51/voodo";
import type { FC } from "react";
import { StarIcon, ThumbDownIcon, ThumbUpIcon, TriangleIcon } from "./muiIcons";

/** A square turned on its point. */
function DiamondIcon({ style, ...props }: IconProps) {
  return (
    <CropSquareIcon
      {...props}
      style={{ transform: "rotate(45deg) scale(0.8)", ...style }}
    />
  );
}

/** Every shape a section can wear, with the name its picker reads. */
export const SECTION_SHAPES: Record<
  SelectionBucketIcon,
  { readonly Icon: FC<IconProps>; readonly label: string }
> = {
  check: { Icon: CheckIcon, label: "Check" },
  x: { Icon: CloseIcon, label: "X" },
  minus: { Icon: RemoveIcon, label: "Minus" },
  star: { Icon: StarIcon, label: "Star" },
  triangle: { Icon: TriangleIcon, label: "Triangle" },
  square: { Icon: CropSquareIcon, label: "Square" },
  circle: { Icon: CircleOutlinedIcon, label: "Circle" },
  diamond: { Icon: DiamondIcon, label: "Diamond" },
  thumbsUp: { Icon: ThumbUpIcon, label: "Thumbs up" },
  thumbsDown: { Icon: ThumbDownIcon, label: "Thumbs down" },
};

/** A section's shape glyph; decorative, the surrounding control names it. */
export default function SectionShape({
  shape,
  size,
  className,
}: {
  shape: SelectionBucketIcon;
  size: number;
  className?: string;
}) {
  const { Icon } = SECTION_SHAPES[shape];
  return (
    <span className={className} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}
