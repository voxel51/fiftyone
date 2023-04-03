import { ExecutionContext } from "./operators";

export class BaseType {}

export class ObjectType extends BaseType {
  constructor(public properties: Map<string, Property> = new Map()) {
    super();
  }
  addProperty(name: string, property: Property) {
    this.properties.set(name, property);
    return property;
  }
  getProperty(name: string) {
    return this.properties.get(name);
  }
  defineProperty(name: string, type: ANY_TYPE, options?: any) {
    const label = options?.label;
    const description = options?.description;
    const view = options?.view || new View();
    if (label) {
      view.label = label;
    }
    if (description) {
      view.description = description;
    }
    const property = new Property(type, { ...(options || {}), view });
    this.addProperty(name, property);
    return property;
  }
  getPropertyList() {
    return Array.from(this.properties.values());
  }
  static fromJSON(json: any) {
    const entries = Object.entries(json.properties).map(([k, v]) => [
      k,
      Property.fromJSON(v),
    ]);
    const type = new ObjectType(new Map(entries));
    type._needsResolution = json.needsResolution;
    return type;
  }
  public _needsResolution = false;
  needsResolution() {
    const propertiesValues = Array.from(this.properties.values());
    return this._needsResolution || propertiesValues.some((p) => p.hasResolver);
  }
}
export class Property {
  constructor(type: ANY_TYPE, options?) {
    this.type = type;
    this.defaultValue = options?.defaultValue;
    this.required = options?.required;
    this.choices = options?.choices;
    this.view = options?.view;
    this._hasResolver = options?.hasResolver;
  }
  type: ANY_TYPE;
  description: string;
  required: boolean;
  defaultValue: any;
  choices: any;
  view: any;

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
      typeFromJSON(json.type),
      json.description,
      json.required,
      json.default,
      json.hasResolver,
      json.view
    );
  }
  toProps() {
    return {
      type: this.type,
      default: this.defaultValue,
      required: this.required,
      choices: this.choices,
      view: this.view,
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

export class View extends BaseType {
  constructor(public options?) {
    super();
  }

  static fromJSON(json: any) {
    return new View(json.label, json.description);
  }
}

export class SampleID extends String {}

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
