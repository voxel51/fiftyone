import { DynamicOperator, ExecutionContext } from "./operators";
import * as types from "./types";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import {
  BOOLEAN_FIELD,
  FLOAT_FIELD,
  getColor,
  INT_FIELD,
  STRING_FIELD,
} from "@fiftyone/utilities";

const VALID_COLOR_ATTRIBUTE_TYPES = [BOOLEAN_FIELD, INT_FIELD, STRING_FIELD];
const colorBlindFriendlyPalette = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

export class CustomColors extends DynamicOperator {
  constructor() {
    super("custom-colors", "Custom Colors");
  }
  useHooks(ctx: ExecutionContext) {
    const fields = useRecoilValue(fos.fieldPaths({}));
    const path = ctx.params.field || "filename";
    const expandedPath = useRecoilValue(fos.expandPath(path));
    const colorAttributeOptions = useRecoilValue(
      fos.fields({
        path: expandedPath,
        ftype: VALID_COLOR_ATTRIBUTE_TYPES,
      })
    )
      .filter((field) => field.dbField !== "tags")
      .map((field) => ({ value: field.path, label: field.name }));
    const opacityAttributeOptions = useRecoilValue(
      fos.fields({
        path: expandedPath,
        ftype: FLOAT_FIELD,
      })
    ).map((field) => ({ value: field.path, label: field.name }));

    const coloring = useRecoilValue(fos.coloring(false));
    const pool = coloring.pool;
    const defaultColor = getColor(pool, coloring.seed, path ?? "");

    const getDefaultColor = (key: string) => {
      if (key === "attributeForOpacity") return undefined;
      if (key === "colors") return [];
      if (key === "labelColors")
        return [
          {
            name: "",
            color:
              colorBlindFriendlyPalette[
                Math.floor(Math.random() * coloring.pool.length)
              ],
          },
        ];
    };

    return {
      fields,
      defaultColor,
      pool,
    };
  }
  async resolveInput(ctx: ExecutionContext): Promise<types.Property> {
    const inputs = new types.ObjectType();
    const fields = ctx.hooks.fields;
    console.log(ctx.hooks);
    inputs.defineProperty("field", new types.Enum(fields));

    if (ctx.params.field) {
      inputs.defineProperty("color", new types.String(), {
        label: "Color",
        description: "The color to use for this field",
        default: ctx.hooks.defaultColor,
      });
      if (ctx.hooks.pool) {
        inputs.defineProperty("pool", new types.List(new types.String()), {
          label: "Color Pool",
          description: "The pool of colors to use for this field",
          default: ctx.hooks.pool,
        });
      }
    }

    return new types.Property(inputs);
  }
  async execute(ctx: ExecutionContext) {}
}
