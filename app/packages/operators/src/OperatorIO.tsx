import OperatorIOComponent from "./OperatorIOComponent";

export default function OperatorIO(props) {
  const { schema } = props;
  const schemaView = schema?.view;
  const schemaWithoutTitle = schemaView
    ? { ...schema, view: { ...schemaView, label: undefined } }
    : schema;
  return <OperatorIOComponent {...props} schema={schemaWithoutTitle} />;
}
