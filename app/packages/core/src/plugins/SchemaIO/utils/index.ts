import ObjectView from "../components/ObjectView";
import RadioView from "../components/RadioView";
import DropdownView from "../components/DropdownView";
import CheckboxView from "../components/CheckboxView";
import FieldView from "../components/FieldView";
import ListView from "../components/ListView";
import OneOfView from "../components/OneOfView";
import UnsupportedView from "../components/UnsupportedView";
import TuplesView from "../components/TuplesView";
import CodeView from "../components/CodeView";
import ColorView from "../components/ColorView";
import TabsView from "../components/TabsView";
import JSONView from "../components/JSONView";
import AutocompleteView from "../components/AutocompleteView";
import FileView from "../components/FileView";
import AlertView from "../components/AlertView";
import HeaderView from "../components/HeaderView";
import LoadingView from "../components/LoadingView";
import HiddenView from "../components/HiddenView";
import ButtonView from "../components/ButtonView";
import LinkView from "../components/LinkView";
import InferredView from "../components/InferredView";

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
  CodeView: CodeView,
  ColorView: ColorView,
  TabsView: TabsView,
  JSONView: JSONView,
  AutocompleteView: AutocompleteView,
  FileView: FileView,
  AlertView: AlertView,
  HeaderView: HeaderView,
  LoadingView: LoadingView,
  HiddenView: HiddenView,
  ButtonView: ButtonView,
  LinkView: LinkView,
  ReadOnlyView: InferredView,
  UnsupportedView: UnsupportedView,
};

export function getComponent(schema) {
  const { component } = schema?.view || {};
  return componentsMap[component] || UnsupportedView;
}

export { operatorToIOSchema } from "./operator-schema";
