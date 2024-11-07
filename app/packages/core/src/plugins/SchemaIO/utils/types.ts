export type SchemaViewType = { [key: string]: any };

export type BaseSchemaType = {
  type: string;
  view: SchemaViewType;
  default?: unknown;
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
    value: any,
    schema?: Schema,
    ancestors?: AncestorsType
  ) => void;
  parentSchema?: SchemaType;
  relativePath: string;
  data?: any;
  initialData?: any;
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
  otherProps: { [key: string]: any };
};

export type CustomComponentsType = {
  [name: string]: React.ComponentType;
};

export type AncestorsType = {
  [path: string]: SchemaType;
};
