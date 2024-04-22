const CSS_UNIT_PATTERN =
  /(\d+)(cm|mm|in|px|pt|pc|em|ex|ch|rem|vw|vh|vmin|vmax|%)$/;

export function parseSize(value: number | string, max: number) {
  const valueIsNumber = typeof value === "number";
  const valueIsRelativeString =
    typeof value === "string" && !CSS_UNIT_PATTERN.test(value);
  const maxIsNumber = typeof max === "number";
  if ((valueIsNumber || valueIsRelativeString) && maxIsNumber) {
    const floatValue = parseFloat(value.toString());
    return Math.min(1, Math.max(floatValue / 100, 0)) * max;
  }
  return value;
}

export function spaceToHeight(space: number, max: number) {
  if (typeof space === "number" && typeof max === "number") {
    return space * (max / 12);
  }
}

export function getLayoutProps(props) {
  const { schema, layout = {} } = props;
  const { view = {} } = schema;
  const { height, width } = layout;
  return {
    height: parseSize(view.height, height),
    width: parseSize(view.width, width),
    minHeight: parseSize(view.minHeight || view.min_height, height),
    minWidth: parseSize(view.minWidth || view.min_width, width),
    maxHeight: parseSize(view.maxHeight || view.max_height, height),
    maxWidth: parseSize(view.maxWidth || view.min_width, width),
  };
}
