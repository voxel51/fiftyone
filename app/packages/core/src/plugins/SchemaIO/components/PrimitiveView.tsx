import LabelValueView from "./LabelValueView";
import CheckboxView from "./CheckboxView";
import FieldView from "./FieldView";

export default function PrimitiveView(props) {
  const { view = {}, type } = props.schema;
  const { readOnly } = view;
  const Component = readOnly
    ? LabelValueView
    : type === "boolean"
      ? CheckboxView
      : FieldView;
  return <Component {...props} />;
}
