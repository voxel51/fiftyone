import { ExecutionContext } from "./operators";

export class BaseType {}

export class Void extends BaseType {
  static fromJSON(json: any) {
    return new Void();
  }
}
class OperatorObject extends BaseType {
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
  obj(name, options: any = {}) {
    return this.defineProperty(name, new OperatorObject(), options);
  }
  str(name, options: any = {}) {
    return this.defineProperty(name, new OperatorString(), options);
  }
  bool(name, options: any = {}) {
    return this.defineProperty(name, new OperatorBoolean(), options);
  }
  int(name, options: any = {}) {
    return this.defineProperty(name, new OperatorNumber(), options);
  }
  float(name, options: any = {}) {
    return this.defineProperty(name, new OperatorNumber(), options);
  }
  list(name, elementType: ANY_TYPE, options: any = {}) {
    return this.defineProperty(name, new List(elementType), options);
  }
  enum(name, values: any[], options: any = {}) {
    return this.defineProperty(name, new Enum(values), options);
  }
  map(name, keyType: ANY_TYPE, valueType: ANY_TYPE, options: any = {}) {
    return this.defineProperty(
      name,
      new OperatorMap(keyType, valueType),
      options
    );
  }
  oneof(name, types: ANY_TYPE[], options: any = {}) {
    return this.defineProperty(name, new OneOf(types), options);
  }
  tuple(name, items: ANY_TYPE[], options: any = {}) {
    return this.defineProperty(name, new Tuple(items), options);
  }
  static fromJSON(json: any) {
    const entries = Object.entries(json.properties).map(([k, v]) => [
      k,
      Property.fromJSON(v),
    ]);
    return new OperatorObject(new Map(entries));
  }
}
export { OperatorObject as Object };
export class Property {
  constructor(type: ANY_TYPE, options?) {
    this.type = type;
    this.defaultValue = options?.defaultValue || options?.default;
    this.required = options?.required;
    this.choices = options?.choices;
    this.invalid = options?.invalid;
    this.errorMessage = options?.errorMessage;
    this.view = options?.view;
  }
  type: ANY_TYPE;
  description: string;
  required: boolean;
  defaultValue: any;
  choices: any;
  view: any;
  invalid: boolean;
  errorMessage: string;

  public resolver: (property: Property, ctx: ExecutionContext) => Property;
  static fromJSON(json: any) {
    const { error_message: errorMessage, type, ...rest } = json;
    return new Property(typeFromJSON(json.type), { errorMessage, ...rest });
  }
  toProps() {
    return {
      type: this.type,
      default: this.defaultValue,
      required: this.required,
      choices: this.choices,
      view: this.view,
      invalid: this.invalid,
      errorMessage: this.errorMessage,
    };
  }
}

class OperatorString extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export { OperatorString as String };
class OperatorBoolean extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export { OperatorBoolean as Boolean };
class OperatorNumber extends BaseType {
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
    return new OperatorNumber(json);
  }
}
export { OperatorNumber as Number };
export class List extends BaseType {
  constructor(
    public elementType: ANY_TYPE,
    public minItems?: number,
    public maxItems?: number
  ) {
    super();
  }

  static fromJSON({ element_type, min_items, max_items }) {
    return new List(typeFromJSON(element_type), min_items, max_items);
  }
}
export class SampleID extends OperatorString {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export class Enum extends BaseType {
  constructor(public values: string[]) {
    super();
  }

  static fromJSON(json: { values: string[] }) {
    return new Enum(json.values);
  }
}
export class OneOf extends BaseType {
  constructor(public types: ANY_TYPE[]) {
    super();
  }

  static fromJSON({ types }) {
    return new OneOf(types.map(typeFromJSON));
  }
}
export class Tuple extends BaseType {
  constructor(public items: ANY_TYPE[]) {
    super();
  }

  static fromJSON({ items }) {
    return new Tuple(items.map(typeFromJSON));
  }
}

class OperatorMap extends BaseType {
  constructor(public keyType: ANY_TYPE, public valueType: ANY_TYPE) {
    super();
  }

  static fromJSON({ key_type, value_type }) {
    return new OperatorMap(typeFromJSON(key_type), typeFromJSON(value_type));
  }
}
export { OperatorMap as Map };

/**
 * Trigger
 */

export class Trigger extends BaseType {
  constructor(public operator: string, public params: object) {
    super();
  }
  static fromJSON({ operator, params }) {
    return new Trigger(operator, params);
  }
}

/**
 * Placement
 */

export class Placement {
  constructor(public place: Places, public view: View = null) {}
  static fromJSON(json) {
    return new Placement(
      json.place,
      json.view ? View.fromJSON(json.view) : null
    );
  }
}

/**
 * Views
 */

type ViewProps = {
  label?: string;
  description?: string;
  caption?: string;
  space?: number;
  name?: string;
  [key: string]: ViewPropertyTypes;
};
export class View {
  constructor(public options: ViewProps = {}) {
    this.label = options.label;
    this.description = options.description;
    this.caption = options.caption;
    this.space = options.space;
    this.componentsProps = options.componentsProps;
    this.name = "View";
    this.options = options;
  }
  label?: string;
  description?: string;
  caption?: string;
  space?: number;
  name?: string;
  componentsProps?: unknown;
  static fromJSON(json: ViewProps) {
    return new View(json);
  }
}
export class InferredView extends View {
  constructor(options?: ViewProps) {
    super(options);
    this.name = "InferredView";
  }
}
export class Form extends View {
  constructor(
    public live: boolean = false,
    public submitButtonLabel: string = "Execute",
    public cancelButtonLabel: string = "Close",
    options: ViewProps
  ) {
    super(options);
    this.name = "Form";
  }
  static fromJSON(json: ViewProps) {
    return new Form(
      json.live as boolean,
      json.submitButtonLabel as string,
      json.cancelButtonLabel as string,
      json
    );
  }
}
export class ReadonlyView extends View {
  readOnly: boolean;
  constructor(options: ViewProps) {
    super(options);
    this.readOnly = true;
    this.name = "ReadonlyView";
  }
}
export class Choice extends View {
  value: string;
  constructor(value: string, options: ViewProps = {}) {
    super(options);
    this.value = value;
    this.name = "Choice";
  }
  static fromJSON(json) {
    return new Choice(json.value, json);
  }
}
export class Choices extends View {
  choices: Choice[];
  constructor(options?: ChoicesOptions) {
    options = options || { choices: [] };
    super(options);
    this.choices = options.choices;
    this.name = "Choices";
  }
  values() {
    return this.choices.map((c) => c.value);
  }
  addChoice(value: string, options: ViewProps = {}) {
    this.choices.push(new Choice(value, options));
  }
  static fromJSON(json) {
    return new Choices({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}
export class RadioGroup extends Choices {
  orientation: ViewOrientation;
  constructor(options?: ChoicesOptions) {
    super(options);
    this.orientation = options.orientation as ViewOrientation;
    this.name = "RadioGroup";
  }
  static fromJSON(json) {
    return new RadioGroup({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}
export class Dropdown extends Choices {
  constructor(options?: ChoicesOptions) {
    super(options);
    this.name = "Dropdown";
  }
  static fromJSON(json) {
    return new Dropdown({
      ...json,
      choices: json.choices?.map((c) => Choice.fromJSON(c)),
    });
  }
}
export class Notice extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Notice";
  }
  static fromJSON(json) {
    return new Notice(json);
  }
}
export class Header extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Header";
  }
  static fromJSON(json) {
    return new Header(json);
  }
}
export class Warning extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Warning";
  }
  static fromJSON(json) {
    return new Warning(json);
  }
}
class ErrorView extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Error";
  }
  static fromJSON(json) {
    return new ErrorView(json);
  }
}
export { ErrorView as Error };
export class Button extends View {
  operator: string;
  params: object;

  constructor(options: ViewProps) {
    super(options);
    this.operator = options.operator as string;
    this.params = options.operator as object;
    this.name = "Button";
  }
  static fromJSON(json) {
    return new Button(json);
  }
}
export class OneOfView extends View {
  oneof: Array<View>;
  constructor(options: ViewProps) {
    super(options);
    this.oneof = options.oneof as Array<View>;
    this.name = "OneOfView";
  }
  static fromJSON(json) {
    return new OneOfView({ ...json, oneof: json.oneof.map(viewFromJSON) });
  }
}
export class ListView extends View {
  items: View;
  constructor(options: ViewProps) {
    super(options);
    this.items = options.items as View;
    this.name = "ListView";
  }
  static fromJSON(json) {
    return new ListView({ ...json, items: viewFromJSON(json.items) });
  }
}
export class TupleView extends View {
  items: Array<View>;
  constructor(options: ViewProps) {
    super(options);
    this.items = options.items as Array<View>;
    this.name = "TupleView";
  }
  static fromJSON(json) {
    return new TupleView({ ...json, items: json.items.map(viewFromJSON) });
  }
}
export class CodeView extends View {
  language: string;
  constructor(options: ViewProps) {
    super(options);
    this.language = options.language as string;
    this.name = "CodeView";
  }
  static fromJSON(json) {
    return new CodeView(json);
  }
}
export class ColorView extends View {
  compact: boolean;
  variant: string;
  constructor(options: ViewProps) {
    super(options);
    this.compact = options.compact as boolean;
    this.variant = options.variant as string;
    this.name = "ColorView";
  }
  static fromJSON(json) {
    return new ColorView(json);
  }
}
export class TabsView extends View {
  variant: string;
  constructor(options: ViewProps) {
    super(options);
    this.variant = options.variant as string;
    this.name = "TabsView";
  }
  static fromJSON(json) {
    return new TabsView(json);
  }
}
export class JSONView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "JSONView";
  }
  static fromJSON(json) {
    return new JSONView(json);
  }
}
export class AutocompleteView extends Choices {
  constructor(options?: ChoicesOptions) {
    super(options);
    this.name = "AutocompleteView";
  }
  static fromJSON(json) {
    return new AutocompleteView(json);
  }
}
export class FileView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "FileView";
  }
  static fromJSON(json) {
    return new FileView(json);
  }
}
export class LinkView extends View {
  href: string;
  constructor(options: ViewProps) {
    super(options);
    this.href = options.href as string;
    this.name = "LinkView";
  }
  static fromJSON(json) {
    return new LinkView(json);
  }
}
export class HiddenView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "HiddenView";
  }
  static fromJSON(json) {
    return new HiddenView(json);
  }
}
export class LoadingView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "LoadingView";
  }
  static fromJSON(json) {
    return new LoadingView(json);
  }
}
export class PlotlyView extends View {
  data: object;
  config: object;
  layout: object;

  constructor(options: ViewProps) {
    super(options);
    this.data = options.href as object;
    this.config = options.config as object;
    this.layout = options.layout as object;
    this.name = "PlotlyView";
  }
  static fromJSON(json) {
    return new PlotlyView(json);
  }
}
export class KeyValueView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "KeyValueView";
  }
  static fromJSON(json) {
    return new KeyValueView(json);
  }
}
export class Column extends View {
  constructor(public key: string, options: ViewProps) {
    super(options);
    this.name = "Column";
  }
  clone() {
    return new Column(this.key, this.options);
  }
  static fromJSON(json) {
    return new Column(json.key, json);
  }
}
export class TableView extends View {
  columns: Array<Column>;
  constructor(options: ViewProps) {
    super(options);
    this.columns = options.columns as Array<Column>;
    this.name = "TableView";
  }
  keys() {
    return this.columns.map((column) => column.key);
  }
  addColumn(key, options) {
    const column = new Column(key, options);
    this.columns.push(column);
    return column;
  }
  clone() {
    const columns = this.columns.map((column) => column.clone());
    return new TableView({ ...this.options, columns });
  }
  static fromJSON(json) {
    return new TableView(json);
  }
}
export class MapView extends View {
  key: string;
  value: any;
  constructor(options: ViewProps) {
    super(options);
    this.key = options.key as string;
    this.value = options.value;
    this.name = "MapView";
  }
  static fromJSON(json) {
    return new MapView(json);
  }
}
export class ProgressView extends View {
  variant: string;
  constructor(options: ViewProps) {
    super(options);
    this.variant = options.variant as string;
    this.name = "ProgressView";
  }
  static fromJSON(json) {
    return new ProgressView(json);
  }
}

/**
 * Utilities and base types
 */

export enum Places {
  SAMPLES_GRID_ACTIONS = "samples-grid-actions",
  SAMPLES_GRID_SECONDARY_ACTIONS = "samples-grid-secondary-actions",
  SAMPLES_VIEWER_ACTIONS = "samples-viewer-actions",
  EMBEDDINGS_ACTIONS = "embeddings-actions",
  HISTOGRAM_ACTIONS = "histograms-actions",
  MAP_ACTIONS = "map-actions",
  MAP_SECONDARY_ACTIONS = "map-secondary-actions",
  DISPLAY_OPTIONS = "display-options",
}

// NOTE: keys should always match fiftyone/operators/types.py
const TYPES = {
  Void,
  Object: OperatorObject,
  String: OperatorString,
  Boolean: OperatorBoolean,
  Number: OperatorNumber,
  List,
  Enum,
  OneOf,
  Tuple,
  Map: OperatorMap,
};

// NOTE: this should always match fiftyone/operators/types.py
const VIEWS = {
  View,
  InferredView,
  Form,
  ReadonlyView,
  Choice,
  Choices,
  RadioGroup,
  Dropdown,
  Notice,
  Header,
  Warning,
  Error: ErrorView,
  Button,
  OneOfView,
  ListView,
  TupleView,
  CodeView,
  ColorView,
  JSONView,
  AutocompleteView,
  FileView,
  LinkView,
  HiddenView,
  LoadingView,
  PlotlyView,
  KeyValueView,
  Column,
  TableView,
  MapView,
  ProgressView,
};

export function typeFromJSON({ name, ...rest }): ANY_TYPE {
  const TypeClass = TYPES[name];
  if (TypeClass) return TypeClass.fromJSON(rest);
  throw new Error(`Unknown type ${name}`);
}

export function viewFromJSON(json) {
  const { name } = json;
  const ViewClass = VIEWS[name];
  if (!ViewClass) throw new Error(`Unknown view ${name}`);
  return ViewClass.fromJSON(json);
}

/**
 * - `OperatorObject` is exported as `Object`
 * - `OperatorString` is exported as `String`
 * - `OperatorBoolean` is exported as `Boolean`
 * - `OperatorNumber` is exported as `Number`
 * - `OperatorMap` is exported as `Map`
 */
export type ANY_TYPE =
  | Void
  | OperatorObject
  | OperatorString
  | OperatorBoolean
  | OperatorNumber
  | List
  | Enum
  | OneOf
  | Tuple
  | OperatorMap;
export type ViewOrientation = "horizontal" | "vertical";
export type ViewPropertyTypes =
  | string
  | boolean
  | number
  | Array<View>
  | View
  | object
  | ViewOrientation;
type ChoicesOptions = ViewProps & {
  choices: Choice[];
};
