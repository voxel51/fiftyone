import ObjectView from "../components/ObjectView";
import RadioView from "../components/RadioView";
import DropdownView from "../components/DropdownView";
import CheckboxView from "../components/CheckboxView";
import FieldView from "../components/FieldView";
import ListView from "../components/ListView";
import OneOfView from "../components/OneOfView";
import UnsupportedView from "../components/UnsupportedView";
import TuplesView from "../components/TuplesView";
import CodeEditorView from "../components/CodeEditorView";
import ColorView from "../components/ColorView";
import TabsView from "../components/TabsView";
import JSONView from "../components/JSONView";

export function log(...args) {
  console.groupCollapsed(">>>", ...args);
  console.trace();
  console.groupEnd();
}

export function getPath(basePath, propertyKey) {
  let computedPath = basePath;
  if (computedPath) computedPath += ".";
  computedPath += propertyKey;
  return computedPath;
}

const componentsMap = {
  ObjectView: ObjectView,
  CheckboxView: CheckboxView,
  FieldView: FieldView,
  ListView: ListView,
  RadioView: RadioView,
  DropdownView: DropdownView,
  OneOfView: OneOfView,
  TupleView: TuplesView,
  CodeEditorView: CodeEditorView,
  ColorView: ColorView,
  TabsView: TabsView,
  JSONView: JSONView,
  UnsupportedView: UnsupportedView,
};

export function getComponent(schema) {
  const { component } = schema?.view || {};
  return componentsMap[component] || UnsupportedView;
}

export { operatorToIOSchema } from "./operator-schema";
