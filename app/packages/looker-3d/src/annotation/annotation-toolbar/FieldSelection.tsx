import { useTheme } from "@fiftyone/components";
import {
  activeSchemas,
  fieldTypes,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/state";
import { currentActiveAnnotationField3dAtom } from "@fiftyone/looker-3d/src/state";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useRecoilState } from "recoil";

export const FieldSelection = () => {
  const [currentActiveField, setCurrentActiveField] = useRecoilState(
    currentActiveAnnotationField3dAtom
  );
  const activeSchema = useAtomValue(activeSchemas);
  const fieldTypesVal = useAtomValue(fieldTypes);

  const schemaFields = useMemo(
    () =>
      Object.keys(activeSchema ?? {}).filter((field) => {
        const thisFieldType = fieldTypesVal[field].toLocaleLowerCase();
        return (
          thisFieldType === "polyline" ||
          thisFieldType === "polylines" ||
          thisFieldType === "detection" ||
          thisFieldType === "detections"
        );
      }),
    [activeSchema, fieldTypesVal]
  );

  const theme = useTheme() as any;

  useEffect(() => {
    if (currentActiveField === null && schemaFields.length > 0) {
      setCurrentActiveField(schemaFields[0]);
    }

    // Make sure active field is in the schema fields
    if (
      currentActiveField &&
      schemaFields.length > 0 &&
      !schemaFields.includes(currentActiveField)
    ) {
      setCurrentActiveField(schemaFields[0]);
    }
  }, [currentActiveField, schemaFields]);

  if (schemaFields.length === 0) {
    return null;
  }

  return (
    <div style={{ minWidth: "40px", maxWidth: "80px" }}>
      <select
        value={currentActiveField || ""}
        onChange={(e) => setCurrentActiveField(e.target.value)}
        style={{
          width: "100%",
          padding: "4px 8px",
          backgroundColor: theme.background.level3,
          color: theme.text.primary,
          border: `1px solid ${theme.background.level1}`,
          borderRadius: "4px",
          fontSize: "0.75rem",
          height: "28px",
          outline: "none",
        }}
      >
        {schemaFields.map((field) => (
          <option key={field} value={field}>
            {field}
          </option>
        ))}
      </select>
    </div>
  );
};
