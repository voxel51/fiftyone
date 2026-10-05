type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

/**
 * The plain-object form of an MUI `sx` type (e.g. `ButtonProps["sx"]`). MUI
 * types it as a union of CSS properties, pseudo selectors and nested
 * selectors; merging them lets individual keys be assigned.
 */
export type StyleObject<Sx> = UnionToIntersection<
  Exclude<
    Sx,
    | ((...args: never[]) => unknown)
    | ReadonlyArray<unknown>
    | boolean
    | null
    | undefined
  >
>;

export function getColorByCode(code: ColorType) {
  if (code) {
    if (code === "primary") return "var(--fo-palette-text-primary)";
    if (code === "secondary") return "var(--fo-palette-text-secondary)";
    if (fiftyOneColorNames.includes(code))
      return "var(--fo-palette-primary-main)";
    return code;
  }
  return undefined;
}

export function getDisabledColors() {
  return ["var(--fo-palette-primary-main)", "var(--fo-palette-text-primary)"];
}

export function getFieldSx(options: FieldsetOptionsType) {
  const { color, variant } = options;
  const sx = {
    "& fieldset": {
      borderColor: `${getColorByCode(color)}!important`,
    },
  };
  if (variant === "square") {
    sx["& fieldset"].borderWidth = "0 0 1px 0 !important";
    sx["& fieldset"].borderRadius = 0;
    sx.borderRadius = "3px 3px 0 0";
    sx.backgroundColor = (theme) => theme.palette.background.field;
  }
  return sx;
}

const fiftyOneColorNames = ["51", "orange", "FiftyOne", "fiftyone"];

type ColorType =
  | "primary"
  | "secondary"
  | "51"
  | "orange"
  | "FiftyOne"
  | "fiftyone";

type FieldsetOptionsType = {
  color: ColorType;
  variant?: "outlined" | "square";
};
