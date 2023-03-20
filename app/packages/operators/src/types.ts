import { ExecutionContext } from "./operators";

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
    type._needsResolution = json.needsResolution;
    return type;
  }
  toProps() {
    return this.properties.map((p) => p.toProps());
  }
  getResolverableProperties() {
    return this.properties.filter((p) => p.hasResolver);
  }
  public _needsResolution: boolean = false;
  needsResolution() {
    return this._needsResolution || this.properties.some((p) => p.hasResolver);
  }
}
export class Property {
  constructor(
    public name: string,
    type: ANY_TYPE,
    description: string,
    required: boolean,
    defaultValue?: any,
    public _hasResolver: boolean = false
  ) {
    this.type = type;
    this.description = description;
    this.required = required;
    this.defaultValue = defaultValue;
  }
  type: ANY_TYPE;
  description: string;
  required: boolean;
  defaultValue: any;
  get hasResolver() {
    return (
      this._hasResolver ||
      typeof this.resolver === "function" ||
      this.type.hasResolver
    );
  }
  public resolver: (property: Property, ctx: ExecutionContext) => Property;
  static fromJSON(json: any) {
    return new Property(
      json.name,
      typeFromJSON(json.type),
      json.description,
      json.required,
      json.default,
      json.hasResolver
    );
  }
  toProps() {
    return {
      name: this.name,
      label: this.name,
      type: this.type,
      default: this.defaultValue,
    };
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
export const TYPES = [ObjectType, String, Boolean, Number, List, Enum];

export function typeFromJSON({ name, ...rest }): ANY_TYPE {
  if (name === "Object") {
    return ObjectType.fromJSON(rest);
  }
  for (const type of TYPES) {
    if (type.name === name) {
      return type.fromJSON(rest);
    }
  }
  throw new Error(`Unknown type ${name}`);
}

export type ANY_TYPE = String | Boolean | Number | List | Enum;
