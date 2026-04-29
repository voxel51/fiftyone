import type { SchemaType } from "../../../../../plugins/SchemaIO/utils/types";

/**
 * Builds a single numeric SchemaIO `FieldView` input keyed by `name`, returned
 * as a one-entry object so it can be spread into a parent `properties` map.
 *
 * @param name The property key and label rendered for the input.
 * @param readOnly When true, the field renders as read-only.
 */
const createCoordinateInputSchema = (name: string, readOnly?: boolean) => ({
  [name]: {
    type: "number",
    view: {
      name: "View",
      label: name,
      component: "FieldView",
      readOnly,
    },
  },
});

/**
 * View descriptor that lays out child fields in a single horizontal row,
 * intended to be used as the `view` for a SchemaIO object schema.
 */
const createCoordinateStackSchema = () => ({
  name: "HStackView",
  component: "GridView",
  orientation: "horizontal",
  gap: 1,
  align_x: "left",
  align_y: "top",
});

/**
 * Builds a coordinate group schema for a pair of coordinate values.
 *
 * @param xName Name of the "x" coordinate; appears first in the row
 * @param yName Name of the "y" coordinate; appears second in the row
 * @param readOnly When true, coordinate fields render as read-only.
 */
const createCoordinateGroupSchema = (
  xName: string,
  yName: string,
  readOnly?: boolean
): SchemaType => ({
  type: "object",
  view: createCoordinateStackSchema(),
  properties: {
    ...createCoordinateInputSchema(xName, readOnly),
    ...createCoordinateInputSchema(yName, readOnly),
  },
});

/**
 * Object schema with horizontally-stacked `x` and `y` numeric inputs.
 *
 * @param readOnly When true, both fields render as read-only.
 */
export const createXYGroupSchema = (readOnly?: boolean): SchemaType =>
  createCoordinateGroupSchema("x", "y", readOnly);

/**
 * Object schema with horizontally-stacked `width` and `height` numeric inputs,
 *
 * @param readOnly When true, both fields render as read-only.
 */
export const createWHGroupSchema = (readOnly?: boolean): SchemaType =>
  createCoordinateGroupSchema("width", "height", readOnly);
