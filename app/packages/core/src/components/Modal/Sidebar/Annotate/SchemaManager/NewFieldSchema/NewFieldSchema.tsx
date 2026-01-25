/**
 * NewFieldSchema Component
 *
 * Step 1 of creating a new field - collects field info and creates the field.
 * After creation, transitions to EditFieldLabelSchema.
 */

import { useOperatorExecutor } from "@fiftyone/operators";
import { Button, Size, Variant } from "@voxel51/voodo";
import { useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import {
  activeLabelSchemas,
  currentField,
  labelSchemasData,
} from "../../state";
import Footer from "../Footer";
import { EditContainer } from "../styled";
import { isNewFieldMode } from "../state";

const NewFieldSchema = () => {
  const [isCreating, setIsCreating] = useState(false);
  const createField = useOperatorExecutor("create_and_activate_field");
  const getSchemas = useOperatorExecutor("get_label_schemas");
  const setLabelSchemasData = useSetAtom(labelSchemasData);
  const setActiveLabelSchemas = useSetAtom(activeLabelSchemas);
  const setCurrentField = useSetAtom(currentField);
  const setNewFieldMode = useSetAtom(isNewFieldMode);

  // Prototype: hardcoded test values
  const handleCreate = useCallback(() => {
    setIsCreating(true);

    createField.execute(
      {
        field_name: "test_detection_field",
        field_category: "label",
        field_type: "detections",
        read_only: false,
      },
      {
        callback: (createResult) => {
          if (createResult.error) {
            setIsCreating(false);
            console.error("Failed to create field:", createResult.error);
            return;
          }

          // Refresh schemas data and wait for completion before navigating
          getSchemas.execute(
            {},
            {
              callback: (schemasResult) => {
                setIsCreating(false);

                if (schemasResult.result) {
                  setLabelSchemasData(schemasResult.result.label_schemas);
                  setActiveLabelSchemas(
                    schemasResult.result.active_label_schemas
                  );
                }

                // Now navigate to edit the new field
                setNewFieldMode(false);
                setCurrentField("test_detection_field");
              },
            }
          );
        },
      }
    );
  }, [
    createField,
    getSchemas,
    setLabelSchemasData,
    setActiveLabelSchemas,
    setNewFieldMode,
    setCurrentField,
  ]);

  const handleDiscard = useCallback(() => {
    setNewFieldMode(false);
  }, [setNewFieldMode]);

  return (
    <EditContainer>
      <div style={{ padding: "1rem 0" }}>
        <p>
          <strong>Prototype - Hardcoded values:</strong>
        </p>
        <ul style={{ marginTop: "0.5rem", marginLeft: "1rem" }}>
          <li>Field name: test_detection_field</li>
          <li>Category: label</li>
          <li>Type: detections</li>
        </ul>
      </div>

      <Footer
        secondaryButton={{
          onClick: handleDiscard,
          text: "Discard",
        }}
        primaryButton={{
          onClick: handleCreate,
          disabled: isCreating,
          text: isCreating ? "Creating..." : "Create",
        }}
      />
    </EditContainer>
  );
};

export default NewFieldSchema;
