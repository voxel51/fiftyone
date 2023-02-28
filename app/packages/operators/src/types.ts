export class BaseType {}

export class ObjectType extends BaseType {
  constructor(public properties: Property[] = []) {
    super();
  }
  addProperty(property: Property) {
    this.properties.push(property);
    return property;
  }
  static fromJSON(json: any) {
    const type = new ObjectType(json.properties.map(Property.fromJSON));
    return type;
  }
}
export class Property {
  constructor(
    public name: string,
    public type: ANY_TYPE,
    public description: string,
    public required: boolean,
    public defaultValue: any,
    public choices: any[]
  ) {}
  static fromJSON(json: any) {
    return new Property(
      json.name,
      typeFromJSON(json.type),
      json.description,
      json.required,
      json.default,
      json.choices
    );
  }
}

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
  constructor(public elementType: ANY_TYPE) {
    super();
  }

  static fromJSON({ element_type }) {
    return new List(typeFromJSON(element_type));
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
