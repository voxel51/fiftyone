import { get, merge } from "lodash";
import * as components from "../components";
import { UnsupportedView } from "../components";
import {
  ArraySchemaType,
  CustomComponentsType,
  SchemaType,
  ViewPropsType,
} from "./types";
import { getLayoutProps } from "./layout";
import { isNullish } from "@fiftyone/utilities";

export function log(...args: string[]) {
  console.groupCollapsed(">>>", ...args);
  console.trace();
  console.groupEnd();
}

export function getPath(basePath: string, propertyKey: string) {
  let computedPath = basePath;
  if (computedPath) computedPath += ".";
  computedPath += propertyKey;
  return computedPath;
}

export function getComponent(
  schema: SchemaType,
  customComponents?: CustomComponentsType
) {
  const { component } = schema?.view || {};
  return (
    customComponents?.[component] || components[component] || UnsupportedView
  );
}

export function getComponentProps<P>(
  props: ViewPropsType,
  id: string,
  baseProps?: P
) {
  return merge(
    baseProps || {},
    get(props, `schema.view.componentsProps.${id}`, {})
  );
}

export function getProps<P>(
  props: ViewPropsType,
  id: string,
  baseProps?: P
): P {
  return merge(baseProps, getLayoutProps(props), getComponentProps(props, id));
}

// add map,tuple,oneof support
export function getEmptyValue(schema: ArraySchemaType) {
  const itemsType = schema?.items?.type || "string";
  const emptyValuesByType = {
    string: "",
    number: 0,
    object: {},
    array: [],
  };
  return emptyValuesByType[
    itemsType as unknown as keyof typeof emptyValuesByType
  ];
}

export function getErrorsForView(props: ViewPropsType) {
  const { errors, path } = props;

  const errorsForView = errors?.[path];
  return Array.isArray(errorsForView) ? errorsForView : [];
}

export { default as autoFocus } from "./auto-focus";
export * from "./generate-schema";
export * from "./layout";
export * from "./style";

// Views that renders DynamicIO as a child component
const COMPOSITE_VIEWS = [
  "InferredView",
  "ListView",
  "ObjectView",
  "OneOfView",
  "TupleView",
  "GridView",
  "MenuView",
  "HStackView",
  "VStackView",
  "ButtonGroupView",
];

const NON_EDITABLE_VIEWS = [
  "AlertView",
  "ArrowNavView",
  "ButtonView",
  "ErrorView",
  "GridView",
  "HeaderView",
  "HiddenView",
  "ImageView",
  "JSONView",
  "KeyValueView",
  "LabelValueView",
  "LinkView",
  "LoadingView",
  "MarkdownView",
  "MediaPlayerView",
  "ProgressView",
  "TableView",
  "TagsView",
  "TreeSelectionView",
];

export function isCompositeView(schema: SchemaType) {
  const { component, composite_view } = schema?.view || {};
  return composite_view || COMPOSITE_VIEWS.includes(component);
}

export function isInitialized(props: ViewPropsType) {
  const { initialData, path } = props || {};
  return !isNullish(get(initialData, path));
}

export function isEditableView(schema: SchemaType) {
  return !NON_EDITABLE_VIEWS.includes(schema?.view?.component);
}
