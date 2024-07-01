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

export type SchemaType = BaseSchemaType | ArraySchemaType | ObjectSchemaType;

export type ViewPropsType = {
  schema: SchemaType;
  path: string;
  errors: { [key: string]: string[] };
  customComponents?: CustomComponentsType;
  onChange: (path: string, value: any) => void;
  parentSchema?: SchemaType;
  relativePath: string;
  data?: any;
  layout?: {
    height: number;
    width: number;
  };
};

export type CustomComponentsType = {
  [name: string]: React.ComponentType;
};
