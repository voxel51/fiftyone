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
  str(name, options: any = {}) {
    return this.defineProperty(name, new String(), options);
  }
  bool(name, options: any = {}) {
    return this.defineProperty(name, new Boolean(), options);
  }
  int(name, options: any = {}) {
    return this.defineProperty(name, new Number(), options);
  }
  float(name, options: any = {}) {
    return this.defineProperty(name, new Number(), options);
  }
  list(name, elementType: ANY_TYPE, options: any = {}) {
    return this.defineProperty(name, new List(elementType), options);
  }
  enum(name, values: any[], options: any = {}) {
    return this.defineProperty(name, new Enum(values), options);
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
  dynamic() {
    this._needsResolution = true;
  }
}
export class Property {
  constructor(type: ANY_TYPE, options?) {
    this.type = type;
    this.defaultValue = options?.defaultValue || options?.default;
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
    return new Property(typeFromJSON(json.type), json);
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
  constructor(
    options: { min?: number; max?: number; int?: boolean; float?: boolean } = {}
  ) {
    super();
    this.min = options.min;
    this.max = options.max;
    this.int = options.int;
    this.float = options.float;
  }
  min: number;
  max: number;
  int: boolean;
  float: boolean;
  static fromJSON(json: any) {
    return new Number(json);
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
export class OneOf extends BaseType {
  constructor(public types: [ANY_TYPE]) {
    super();
  }

  static fromJSON({ types }) {
    return new OneOf(types.map(typeFromJSON));
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
export class Tuple extends BaseType {
  constructor(public items: [ANY_TYPE]) {
    super();
  }

  static fromJSON({ items }) {
    return new Tuple(items.map(typeFromJSON));
  }
}

export class MapType extends BaseType {
  constructor(public keyType: ANY_TYPE, public valueType: ANY_TYPE) {
    super();
  }

  static fromJSON({ key_type, value_type }) {
    return new MapType(typeFromJSON(key_type), typeFromJSON(value_type));
  }
}

type BasicView = {
  label?: string;
  description?: string;
  caption?: string;
  space?: number;
};
export class View extends BaseType {
  constructor(public options: BasicView = {}) {
    super();
  }
  label?: string;
  description?: string;
  caption?: string;
  space?: number;
  static fromJSON(json: BasicView) {
    return new View(json);
  }
}

export class Choice extends View {
  constructor(value: any, options: BasicView = {}) {
    super(options);
    this.value = value;
  }
  value: any;
  static fromJSON(json) {
    return new Choice(json.value, json);
  }
}

type ChoicesOptions = BasicView & {
  choices: Choice[];
};
export class Choices extends View {
  constructor(options: ChoicesOptions = {}) {
    super(options);
    if (options.choices) this.choices = options.choices;
  }
  public choices: Choice[] = [];
  values() {
    return this.choices.map((c) => c.value);
  }
  addChoice(value: any, options: BasicView = {}) {
    this.choices.push(new Choice(value, options));
  }
  static fromJSON(json) {
    return new Choices({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}

class RadioGroup extends Choices {
  constructor(options: ChoicesOptions) {
    super(options);
  }
  static fromJSON(json) {
    return new RadioGroup({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}

class Dropdown extends Choices {
  constructor(options: ChoicesOptions) {
    super(options);
  }
  static fromJSON(json) {
    return new Dropdown({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}

class Notice extends View {
  constructor(options: BasicView = {}) {
    super(options);
  }
  static fromJSON(json) {
    return new Notice(json);
  }
}

class Header extends View {
  constructor(options: BasicView = {}) {
    super(options);
  }
  static fromJSON(json) {
    return new Header(json);
  }
}

class Warning extends View {
  constructor(options: BasicView = {}) {
    super(options);
  }
  static fromJSON(json) {
    return new Warning(json);
  }
}

class Button extends View {
  constructor(options: BasicView = {}) {
    super(options);
  }
  static fromJSON(json) {
    return new Button(json);
  }
}

export class SampleID extends String {}

// NOTE: this should always match fiftyone/operators/types.py
export const TYPES = [
  ObjectType,
  String,
  Boolean,
  Number,
  List,
  Enum,
  OneOf,
  Tuple,
  MapType,
];

export function typeFromJSON({ name, ...rest }): ANY_TYPE {
  if (name === "Object") {
    return ObjectType.fromJSON(rest);
  }
  if (name === "Map") {
    return MapType.fromJSON(rest);
  }
  for (const type of TYPES) {
    if (type.name === name) {
      return type.fromJSON(rest);
    }
  }
  throw new Error(`Unknown type ${name}`);
}

export class Placement {
  constructor(public place: Places, public view: View = null) {}
  static fromJSON(json) {
    return new Placement(
      json.place,
      json.view ? View.fromJSON(json.view) : null
    );
  }
}

export enum Places {
  SAMPLES_GRID_ACTIONS = "samples-grid-actions",
  SAMPLES_GRID_SECONDARY_ACTIONS = "samples-grid-secondary-actions",
  EMBEDDINGS_ACTIONS = "embeddings-actions",
  HISTOGRAM_ACTIONS = "histograms-actions",
  MAP_ACTIONS = "map-actions",
  MAP_SECONDARY_ACTIONS = "map-secondary-actions",
  DISPLAY_OPTIONS = "display-options",
}

export type ANY_TYPE = String | Boolean | Number | List | Enum;
