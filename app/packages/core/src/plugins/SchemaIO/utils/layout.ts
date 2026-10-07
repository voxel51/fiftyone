import { SxProps } from "@mui/material";
import { SchemaViewType, ViewPropsType } from "./types";

const CSS_UNIT_PATTERN =
  /(\d+)(cm|mm|in|px|pt|pc|em|ex|ch|rem|vw|vh|vmin|vmax|%)$/;

export function parseSize(
  value: number | string,
  max?: number,
  defaultUnit?: string,
) {
  const valueIsNumber = typeof value === "number";
  const valueIsRelativeString =
    typeof value === "string" && !CSS_UNIT_PATTERN.test(value);

  const maxIsNumber = typeof max === "number";
  if (maxIsNumber && (valueIsNumber || valueIsRelativeString)) {
    const floatValue = parseFloat(value.toString());
    return Math.min(1, Math.max(floatValue / 100, 0)) * max;
  }

  if (defaultUnit !== undefined && valueIsRelativeString) {
    const numericValue = parseFloat(value);
    if (!Number.isNaN(numericValue)) {
      return `${numericValue}${defaultUnit}`;
    }
  }

  return value;
}

// both are checked at runtime, so callers may pass raw view values
export function spaceToHeight(space?: unknown, max?: unknown) {
  if (typeof space === "number" && typeof max === "number") {
    return space * (max / 12);
  }
  return undefined;
}

export function getLayoutProps(props: ViewPropsType) {
  const { schema, layout } = props;
  const { view: schemaView = {} } = schema;
  const view = schemaView as SizeViewOptions;
  const { height, width } = layout || {};
  return {
    sx: {
      height: parseSize(view.height, height),
      width: parseSize(view.width, width),
      minHeight: parseSize(view.minHeight || view.min_height, height),
      minWidth: parseSize(view.minWidth || view.min_width, width),
      maxHeight: parseSize(view.maxHeight || view.max_height, height),
      maxWidth: parseSize(view.maxWidth || view.min_width, width),
    },
  };
}

// takes any object carrying padding keys (a view, or container props)
export function getPaddingSx(schemaView: object = {}): PaddingSxType {
  const view = schemaView as SpacingViewOptions;
  return {
    p: view.pad,
    px: view.pad_x || view.px || view.padX,
    py: view.pad_y || view.py || view.padY,
    pt: view.pad_t || view.pt || view.padT,
    pr: view.pad_r || view.pr || view.padR,
    pb: view.pad_b || view.pb || view.padB,
    pl: view.pad_l || view.pl || view.padL,
  };
}

export function getMarginSx(schemaView: object = {}): MarginSxType {
  const view = schemaView as SpacingViewOptions;
  return {
    m: view.margin,
    mx: view.margin_x || view.mx || view.marginX,
    my: view.margin_y || view.my || view.marginY,
    mt: view.margin_t || view.mt || view.marginT,
    mr: view.margin_r || view.mr || view.marginR,
    mb: view.margin_b || view.mb || view.marginB,
    ml: view.margin_l || view.ml || view.marginL,
  };
}

export function getGridSx(view: SchemaViewType = {}): SxProps {
  const { columns, orientation, rows, alignX, alignY, align_x, align_y } =
    view as GridViewOptions;
  const is2D = orientation !== "vertical" && orientation !== "horizontal";
  const x = alignX || align_x || "start";
  const y = alignY || align_y || "start";
  const sx: SxProps = {
    justifyContent: x,
    alignItems: y,
    ...getPaddingSx(view),
    ...getMarginSx(view),
  };

  if (is2D) {
    sx.display = "flex";
    sx.flexWrap = "wrap";
    sx.justifyContent = ALIGN_MAP[x] || x;
    sx.alignItems = ALIGN_MAP[y] || y;
    return sx;
  }

  sx.display = "grid";

  /**
   *  todo@im: template - auto compute width (height?)
   * [
   *  [1, 2, 3], row 1
   *  [4, 5, 6], row 2
   *  [7, 8, 9], row 3
   * ]
   */
  const direction = orientation === "vertical" ? "row" : "column";
  if (typeof columns === "number") {
    sx.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  } else if (typeof rows === "number") {
    sx.gridTemplateRows = `repeat(${rows}, 1fr)`;
    sx.gridAutoFlow = direction;
  } else {
    sx.gridAutoFlow = direction;
  }
  return sx;
}

export const overlayToSx = {
  "top-left": {
    position: "absolute",
    top: 0,
    left: 0,
  },
  "top-center": {
    position: "absolute",
    top: 0,
    left: "50%",
  },
  "top-right": {
    position: "absolute",
    top: 0,
    right: 0,
  },
  "bottom-left": {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  "bottom-center": {
    position: "absolute",
    bottom: 0,
    left: "50%",
  },
  "bottom-right": {
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  "center-left": {
    position: "absolute",
    top: "50%",
    left: 0,
    transform: "translateY(-50%)",
  },
  "center-center": {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  },
  "center-right": {
    position: "absolute",
    top: "50%",
    right: 0,
    transform: "translateY(-50%)",
  },
};

const ALIGN_MAP = {
  left: "flex-start",
  right: "flex-end",
  center: "safe center",
  top: "flex-start",
  bottom: "flex-end",
  start: "flex-start",
};

export function parseGap(gap: number | string) {
  if (typeof gap === "string") {
    const gapStr = gap.trim().replace("px", "");
    if (Number.isNaN(Number(gapStr))) {
      console.warn("Ignored invalid gap value " + gap);
      return 0;
    }
    const gapInt = parseInt(gapStr);
    return gap.includes("px") ? gapInt / 8 : gapInt;
  } else if (typeof gap === "number") {
    return gap;
  }
  return 0;
}

export function getAdjustedLayoutDimension(value?: number, gap?: number) {
  if (typeof gap === "number" && typeof value === "number") {
    return value - gap * 8;
  }
  return value;
}

export function getAdjustedLayoutDimensions({
  height,
  width,
  gap,
  orientation,
}: {
  height?: number;
  width?: number;
  gap?: number;
  orientation?: string;
}) {
  const adjustedHeight = getAdjustedLayoutDimension(height, gap);
  const adjustedWidth = getAdjustedLayoutDimension(width, gap);
  if (orientation === "horizontal") {
    return { height, width: adjustedWidth };
  }
  return { height: adjustedHeight, width };
}

// view options the layout helpers read; views come from the server, so these
// are only the keys each helper understands
type SizeValue = number | string;
type SizeViewOptions = {
  height?: SizeValue;
  width?: SizeValue;
  minHeight?: SizeValue;
  min_height?: SizeValue;
  minWidth?: SizeValue;
  min_width?: SizeValue;
  maxHeight?: SizeValue;
  max_height?: SizeValue;
  maxWidth?: SizeValue;
};
type SpacingViewOptions = { [key: string]: number | undefined };
type GridViewOptions = {
  columns?: number;
  rows?: number;
  orientation?: string;
  alignX?: string;
  alignY?: string;
  align_x?: string;
  align_y?: string;
};

type PaddingSxType = {
  p?: number;
  px?: number;
  py?: number;
  pt?: number;
  pr?: number;
  pb?: number;
  pl?: number;
};

type MarginSxType = {
  m?: number;
  mx?: number;
  my?: number;
  mt?: number;
  mr?: number;
  mb?: number;
  ml?: number;
};
