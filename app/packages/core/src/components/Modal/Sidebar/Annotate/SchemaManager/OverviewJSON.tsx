import { Code, scrollable } from "@fiftyone/components";
import { useAtomValue } from "jotai";
import { useFullSchemaEditor } from "./hooks";
import { ContentArea } from "./styled";
import { loadedSchemaDoc } from "./useSchemaDocs";

/**
 * JSON view: the selected DOC's stored shape (label_schema +
 * visibility) in custom-schema mode; the dataset envelope otherwise.
 * Read-only.
 */
const OverviewJSON = () => {
  const { currentJson } = useFullSchemaEditor();
  const managerDoc = useAtomValue(loadedSchemaDoc);
  const docJson = managerDoc
    ? JSON.stringify(
        {
          name: managerDoc.name,
          label_schema: managerDoc.label_schema,
          visibility: managerDoc.visibility,
        },
        null,
        2,
      )
    : null;

  // Explicit height: the Code editor sizes to its container, and an
  // auto-height container collapses it to nothing.
  return (
    <ContentArea className={scrollable} style={{ height: "60vh" }}>
      <Code
        value={docJson ?? currentJson}
        language="json"
        height="100%"
        width="100%"
        readOnly
      />
    </ContentArea>
  );
};

export default OverviewJSON;
