export class BaseType {}
export class String extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export class Boolean extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export class Number extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export class List extends BaseType {
  constructor(public elementType: string) {
    super();
  }

  static fromJSON({ element_type }) {
    return new List(element_type);
  }
}
export class Enum extends BaseType {
  constructor(public values: any[]) {
    super();
  }

  static fromJSON(json: { values: any[] }) {
    return new Enum(json.values);
  }
}

// NOTE: this should always match fiftyone/operators/types.py
export const TYPES = [String, Boolean, Number, List, Enum];

export function typeFromJSON({ name, ...rest }): ANY_TYPE {
  for (const type of TYPES) {
    if (type.name === name) {
      return type.fromJSON(rest);
    }
  }
  throw new Error(`Unknown type ${name}`);
}

export type ANY_TYPE = String | Boolean | Number | List | Enum;
