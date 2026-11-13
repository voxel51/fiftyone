// VOODO has no split, star, triangle, or thumbs glyphs yet; these MUI glyphs
// stand in until it does, sized the way VOODO sizes its own icons.
import ChangeHistory from "@mui/icons-material/ChangeHistory";
import StarBorder from "@mui/icons-material/StarBorder";
import ThumbDownOffAlt from "@mui/icons-material/ThumbDownOffAlt";
import ThumbUpOffAlt from "@mui/icons-material/ThumbUpOffAlt";
import VerticalSplit from "@mui/icons-material/VerticalSplit";
import type { SvgIconComponent } from "@mui/icons-material";
import type { IconProps } from "@voxel51/voodo";

function fromMui(Glyph: SvgIconComponent) {
  return function MuiIcon({ size, className, style }: IconProps) {
    return (
      <Glyph
        className={className}
        style={{
          fontSize: typeof size === "number" ? size : undefined,
          ...style,
        }}
      />
    );
  };
}

/** Splits the tray into sections. */
export const SplitIcon = fromMui(VerticalSplit);
export const StarIcon = fromMui(StarBorder);
export const TriangleIcon = fromMui(ChangeHistory);
export const ThumbUpIcon = fromMui(ThumbUpOffAlt);
export const ThumbDownIcon = fromMui(ThumbDownOffAlt);
