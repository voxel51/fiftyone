import { useTheme } from "@fiftyone/components";
import {
  current3dAnnotationModeAtom,
  currentActiveAnnotationField3dAtom,
} from "@fiftyone/looker-3d/src/state";
import {
  DETECTION,
  DETECTIONS,
  POLYLINE,
  POLYLINES,
} from "@fiftyone/utilities";
import { useCallback, useEffect } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { use3dAnnotationFields } from "../use3dAnnotationFields";

export const FieldSelection = () => {
  const [currentActiveField, setCurrentActiveField] = useRecoilState(
    currentActiveAnnotationField3dAtom
  );

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isPolylineAnnotateActive = current3dAnnotationMode === "polyline";
  const isCuboidAnnotateActive = current3dAnnotationMode === "cuboid";

  const predicate = useCallback(
    (fieldType: string) => {
      if (isPolylineAnnotateActive) {
        return (
          fieldType === POLYLINE.toLocaleLowerCase() ||
          fieldType === POLYLINES.toLocaleLowerCase()
        );
      }
      if (isCuboidAnnotateActive) {
        return (
          fieldType === DETECTION.toLocaleLowerCase() ||
          fieldType === DETECTIONS.toLocaleLowerCase()
        );
      }

      return (
        fieldType === DETECTION.toLocaleLowerCase() ||
        fieldType === DETECTIONS.toLocaleLowerCase() ||
        fieldType === POLYLINE.toLocaleLowerCase() ||
        fieldType === POLYLINES.toLocaleLowerCase()
      );
    },
    [isPolylineAnnotateActive, isCuboidAnnotateActive]
  );

  const schemaFields = use3dAnnotationFields(predicate);

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
