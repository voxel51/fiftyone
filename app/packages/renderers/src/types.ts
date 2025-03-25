type Primitives = null | number | string | undefined;

interface Dictionary {
  [key: string]: Primitives | Primitives[] | Dictionary | Dictionary[];
}

export type Data = Dictionary | Primitives | undefined;

export interface Field {
  ftype: string;
  dbField: string | null;
  description: string | null;
  info: object | null;
  name: string;
  embeddedDocType: string | null;
  subfield: string | null;
  path: string;
  fields?: Schema;
  pathWithDbField?: string | null;
}

export interface Schema {
  [key: string]: Field;
}
