import { ExecutionContext } from "./operators";

export class BaseType {}

/**
 * Operator type for representing void value for operator input/output. Void
 *  type can be useful for displaying a informational-only views.
 */
export class Void extends BaseType {
  static fromJSON(json: any) {
    return new Void();
  }
}

/**
 * Operator type for representing an object value for operator input/output.
 */
class OperatorObject extends BaseType {
  /**
   * You can construct operator object type optionally providing a JS `Map` with
   *  key representing the name of a property and the value representing the
   *  property it self. (default: `new Map()`)
   * @param properties initial properties on the object
   */
  constructor(public properties: Map<string, Property> = new Map()) {
    super();
  }
  /**
   * Add a {@link Property} to an object
   * @param name name/key for referencing the property
   * @param property the instance of {@link Property}
   * @returns newly added property
   */
  addProperty(name: string, property: Property) {
    this.properties.set(name, property);
    return property;
  }
  /**
   * Get property defined on the object by name
   * @param name name of the property
   * @returns {Property} value associated to the name/key provided
   */
  getProperty(name: string) {
    return this.properties.get(name);
  }
  /**
   * Define a property on the object
   * @param name name of the property
   * @param type type for the value of the property
   * @param options
   * @returns newly defined property on the object
   */
  defineProperty(name: string, type: ANY_TYPE, options?: PropertyOptions) {
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
  /**
   * Get array of all properties defined on the object
   * @returns properties on the object
   */
  getPropertyList() {
    return Array.from(this.properties.values());
  }
  /**
   * Define a property of type {@link OperatorObject|Object} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  obj(name, options: any = {}) {
    return this.defineProperty(name, new OperatorObject(), options);
  }
  /**
   * Define a property of type {@link OperatorString|String} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  str(name, options: any = {}) {
    return this.defineProperty(name, new OperatorString(), options);
  }
  /**
   * Define a property of type {@link OperatorBoolean|Boolean}  on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  bool(name, options: any = {}) {
    return this.defineProperty(name, new OperatorBoolean(), options);
  }
  /**
   * Define a property of type {@link OperatorNumber|Number} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  int(name, options: any = {}) {
    return this.defineProperty(name, new OperatorNumber(), options);
  }
  /**
   * Define a property of type {@link OperatorNumber|Number} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  float(name, options: any = {}) {
    return this.defineProperty(name, new OperatorNumber(), options);
  }
  /**
   * Define a property of type {@link List} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  list(name, elementType: ANY_TYPE, options: any = {}) {
    return this.defineProperty(name, new List(elementType), options);
  }
  /**
   * Define a property of type {@link Enum} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  enum(name, values: any[], options: any = {}) {
    return this.defineProperty(name, new Enum(values), options);
  }
  /**
   * Define a property of type {@link Map} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  map(name, keyType: ANY_TYPE, valueType: ANY_TYPE, options: any = {}) {
    return this.defineProperty(
      name,
      new OperatorMap(keyType, valueType),
      options
    );
  }
  /**
   * Define a property of type {@link OneOf} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  oneof(name, types: ANY_TYPE[], options: any = {}) {
    return this.defineProperty(name, new OneOf(types), options);
  }
  /**
   * Define a property of type {@link Tuple} on the object
   * @param name name of the property
   * @param options
   * @returns newly defined property
   */
  tuple(name, items: ANY_TYPE[], options: any = {}) {
    return this.defineProperty(name, new Tuple(items), options);
  }
  /**
   * Define an `Object` operator type by providing a json representing the type
   * @param json json object representing the definition of the property
   * @returns operator type `Object` created with json provided
   */
  static fromJSON(json: any) {
    const entries = Object.entries(json.properties).map(([k, v]) => [
      k,
      Property.fromJSON(v),
    ]);
    return new OperatorObject(new Map(entries));
  }
}
export { OperatorObject as Object };

/**
 * Operator type for representing a property of operator
 *  {@link OperatorObject|Object} type.
 */
export class Property {
  /**
   *
   * @param type operator type for the property
   * @param options metadata for the property as described below:
   * - `defaultValue`: default value of the property when operator is executed
   * - `required`: indicates if property is require when executing operator. If
   * `true` and value is not provided, validation error will be raised
   * preventing execution
   * - `invalid`: indicate if value provided for the property is considered
   * invalid.
   * - `errorMessage`: custom error message for the property if `invalid` is
   * set to `true`.
   * view: view options for the property. Refer to {@link View}
   */
  constructor(type: ANY_TYPE, options?) {
    this.type = type;
    this.defaultValue = options?.defaultValue || options?.default;
    this.required = options?.required;
    this.invalid = options?.invalid;
    this.errorMessage = options?.errorMessage;
    this.view = options?.view;
  }
  type: ANY_TYPE;
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  view?: View;
  invalid?: boolean;
  errorMessage?: string;

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

/**
 * Operator type for representing a string value for operator input/output.
 */
class OperatorString extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export { OperatorString as String };

/**
 * Operator type for representing a boolean value for operator input/output.
 */
class OperatorBoolean extends BaseType {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}
export { OperatorBoolean as Boolean };

/**
 * Operator type for representing a number value for operator input/output.
 */
class OperatorNumber extends BaseType {
  /**
   * Construct operator type for number-like values
   * @param options options for defining constraints on a number value
   * @param options.min minimum number a value can be
   * @param options.max maximum number a value can be
   * @param options.max if `true`, the value must be an integer
   * @param options.max if `true`, the value can be integer or floating point
   * number
   */
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

/**
 * Operator type for representing a list value for operator input/output.
 */
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

/**
 * Operator type for representing a sampled id value for operator input/output.
 */
export class SampleID extends OperatorString {
  static fromJSON(json: any) {
    const Type = this;
    const type = new Type();
    return type;
  }
}

/**
 * Operator type for representing an enum value for operator input/output. Enum
 *  is similar to a string, but can define specific values
 */
export class Enum extends BaseType {
  constructor(public values: string[]) {
    super();
  }

  static fromJSON(json: { values: string[] }) {
    return new Enum(json.values);
  }
}

/**
 * Operator type for representing an oneof value for operator input/output.
 *  `OneOf` can be used when a value can be of multiple types.
 */
export class OneOf extends BaseType {
  constructor(public types: ANY_TYPE[]) {
    super();
  }

  static fromJSON({ types }) {
    return new OneOf(types.map(typeFromJSON));
  }
}

/**
 * Operator type for representing a tuple value for operator input/output.
 *  `Tuple` can be useful for defining list of values of mixed types
 */
export class Tuple extends BaseType {
  constructor(public items: ANY_TYPE[]) {
    super();
  }

  static fromJSON({ items }) {
    return new Tuple(items.map(typeFromJSON));
  }
}

/**
 * Operator type for representing a map value for operator input/output. `Map`
 * can be useful for accepting arbitrary key-value pair where key is of type
 * {@link OperatorString|String} and value can be any one of operator type.
 */
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
 * Operator type for defining a trigger for an operator.
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
 * Operator type for defining a placement for an operator. Placement is a button
 *  that can be rendered at various places in the app
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

/**
 * Operator class for describing a view (rendering details in the app) for an
 * operator type.
 */
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

/**
 * Operator class for describing an inferred {@link View} for an operator type.
 * Inferred view is useful for rendering an operator type without the need
 * to describe views for each type and sub-type explicitly
 */
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

/**
 * Operator class for describing a read-only {@link View} for an operator type.
 */
export class ReadOnlyView extends View {
  readOnly: boolean;
  constructor(options: ViewProps) {
    super(options);
    this.readOnly = true;
    this.name = "ReadOnlyView";
  }
}

/**
 * Operator class for describing a choice {@link View} for an operator type.
 * Must be used in conjunction with {@link Choices}
 */
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

/**
 * Operator class for describing choices {@link View} for an operator type.
 */
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

/**
 * Operator class for describing a radio-group {@link View} for an operator type.
 */
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

/**
 * Operator class for describing a dropdown {@link View} for an operator type.
 */
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

/**
 * Operator class for describing a informational notice {@link View} for an
 * operator type.
 */
export class Notice extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Notice";
  }
  static fromJSON(json) {
    return new Notice(json);
  }
}

/**
 * Operator class for describing a header {@link View} for an operator type.
 */
export class Header extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Header";
  }
  static fromJSON(json) {
    return new Header(json);
  }
}
/**
 * Operator class for describing a warning notice {@link View} for an
 * operator type.
 */
export class Warning extends View {
  constructor(options: ViewProps = {}) {
    super(options);
    this.name = "Warning";
  }
  static fromJSON(json) {
    return new Warning(json);
  }
}

/**
 * Operator class for describing a error notice {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a button {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a oneof {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a list {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a tuple {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a code block {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a color picker {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a tabs {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a json {@link View} for an
 * operator type.
 */
export class JSONView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "JSONView";
  }
  static fromJSON(json) {
    return new JSONView(json);
  }
}

/**
 * Operator class for describing an autocomplete {@link View} for an
 * operator type.
 */
export class AutocompleteView extends Choices {
  constructor(options?: ChoicesOptions) {
    super(options);
    this.name = "AutocompleteView";
  }
  static fromJSON(json) {
    return new AutocompleteView(json);
  }
}

/**
 * Operator class for describing a file upload {@link View} for an
 * operator type.
 */
export class FileView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "FileView";
  }
  static fromJSON(json) {
    return new FileView(json);
  }
}

/**
 * Operator class for describing a link {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a hidden {@link View} for an
 * operator type.
 */
export class HiddenView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "HiddenView";
  }
  static fromJSON(json) {
    return new HiddenView(json);
  }
}

/**
 * Operator class for describing a loader {@link View} for an
 * operator type.
 */
export class LoadingView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "LoadingView";
  }
  static fromJSON(json) {
    return new LoadingView(json);
  }
}

/**
 * Operator class for describing a plotly.js {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a key-value {@link View} for an
 * operator type.
 */
export class KeyValueView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "KeyValueView";
  }
  static fromJSON(json) {
    return new KeyValueView(json);
  }
}

/**
 * Operator class for describing a column {@link View} for an
 * operator type. Must be used in conjunction with {@link TableView}
 */
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

/**
 * Operator class for describing a table {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a map {@link View} for an
 * operator type.
 */
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

/**
 * Operator class for describing a progress {@link View} for an
 * operator type.
 */
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
 * Operator class for rendering a string as markdown.
 */
export class MarkdownView extends View {
  constructor(options: ViewProps) {
    super(options);
    this.name = "MarkdownView";
  }
  static fromJSON(json) {
    return new MarkdownView(json);
  }
}

/**
 * Places where you can have your operator placement rendered.
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
  ReadOnlyView,
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
  MarkdownView,
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

type PropertyOptions = {
  label: string;
  description?: string;
  view?: View;
};
