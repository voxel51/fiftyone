export type BaseSchemaType = {
  type: string;
  view: { [key: string]: any };
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

export type ViewPropsType<Schema extends SchemaType = SchemaType> = {
  schema: Schema;
  path: string;
  errors: { [key: string]: string[] };
  customComponents?: CustomComponentsType;
  onChange: (path: string, value: any, schema?: Schema) => void;
  parentSchema?: SchemaType;
  relativePath: string;
  data?: any;
  layout?: {
    height: number;
    width: number;
  };
  autoFocused?: React.MutableRefObject<boolean>;
};

export type CustomComponentsType = {
  [name: string]: React.ComponentType;
};
