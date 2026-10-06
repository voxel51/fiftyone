// Server-configured view options. Keys every view shares are declared here;
// each view types its own component-specific keys where it reads them.
export type SchemaViewType = { [key: string]: unknown } & {
  component?: string;
  composite_view?: boolean;
  name?: string;
  label?: string;
  description?: string;
  caption?: string;
  placeholder?: string;
  readOnly?: boolean;
  read_only?: boolean;
};

export type BaseSchemaType = {
  type: string;
  view: SchemaViewType;
  default?: unknown;
  name?: string;
  read_only?: boolean;
  // operator URI triggered on change (Property.toProps' onChange)
  onChange?: string;
};

export type ArraySchemaType = BaseSchemaType & {
  items: BaseSchemaType;
};

export type ObjectSchemaType = BaseSchemaType & {
  properties: { [key: string]: SchemaType };
};

export type NumberSchemaType = BaseSchemaType & {
  min?: number;
  max?: number;
  multipleOf?: number;
};

export type SchemaType =
  | BaseSchemaType
  | ArraySchemaType
  | ObjectSchemaType
  | NumberSchemaType;

export type PropertyType = SchemaType & { id: string };

export type ViewPropsType<Schema extends SchemaType = SchemaType> = {
  root_id?: string;
  schema: Schema;
  path: string;
  errors: { [key: string]: string[] };
  customComponents?: CustomComponentsType;
  onChange: (
    path: string,
    value: unknown,
    schema?: Schema,
    ancestors?: AncestorsType,
  ) => void;
  parentSchema?: SchemaType;
  relativePath: string;
  data?: unknown;
  initialData?: unknown;
  layout?: {
    height: number;
    width: number;
  };
  /**
   * Experimental. Only available for DashboardView
   */
  relativeLayout?: {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW: number;
    minH: number;
    COLS: number;
    ROWS: number;
  };
  autoFocused?: React.MutableRefObject<boolean>;
  otherProps: Record<string, unknown>;
  /**
   * Custom. Available only when explicitly passed to the view.
   */
  onClick?: (
    e: React.MouseEvent,
    params: Record<string, unknown>,
    props: ViewPropsType,
  ) => void;
  fullData?: Record<string, unknown>;
  onValidationErrors?: (
    basePath: string,
    errors: ValidationErrorType[],
  ) => void;
};

export type CustomComponentsType = {
  [name: string]: React.ComponentType;
};

export type AncestorsType = {
  [path: string]: SchemaType;
};

export type ValidationErrorType = {
  path: string;
  reason: string;
};
