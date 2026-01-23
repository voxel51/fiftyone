import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { useOperatorExecutor } from "@fiftyone/operators";
import {
  Button,
  Icon,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ToggleSwitch,
  Variant,
} from "@voxel51/voodo";
import { useAtom, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import {
  activeLabelSchemas,
  addToActiveSchemas,
  removeFromActiveSchemas,
} from "../../state";
import Footer from "../Footer";
import { EditContainer, SchemaSection } from "../styled";
import Errors from "./Errors";
import GUIContent from "./GUIContent";
import Header from "./Header";
import JSONEditor from "./JSONEditor";
import useLabelSchema from "./useLabelSchema";
import { TAB_GUI, TAB_IDS, TAB_JSON, TabId } from "../constants";

const EditFieldLabelSchema = ({ field }: { field: string }) => {
  const { isEnabled: isM4Enabled } = useFeature({
    feature: FeatureFlag.VFF_ANNOTATION_M4,
  });
  const labelSchema = useLabelSchema(field);
  const showScanButton = !labelSchema.savedLabelSchema;
  // Default to JSON tab when scan button is shown (no existing schema)
  const [activeTab, setActiveTab] = useState<TabId>(
    showScanButton ? TAB_JSON : TAB_GUI
  );
  const [activeFields] = useAtom(activeLabelSchemas);
  const addToActive = useSetAtom(addToActiveSchemas);
  const removeFromActive = useSetAtom(removeFromActiveSchemas);
  const activateFields = useOperatorExecutor("activate_label_schemas");
  const deactivateFields = useOperatorExecutor("deactivate_label_schemas");

  const isFieldVisible = activeFields?.includes(field) ?? false;

  const handleToggleVisibility = useCallback(() => {
    const fieldSet = new Set([field]);
    if (isFieldVisible) {
      // Move to hidden (optimistic update with rollback on error)
      removeFromActive(fieldSet);
      deactivateFields.execute(
        { fields: [field] },
        {
          callback: (result) => {
            if (result.error) {
              addToActive(fieldSet); // rollback on failure
            }
          },
        }
      );
    } else {
      // Move to active (optimistic update with rollback on error)
      addToActive(fieldSet);
      activateFields.execute(
        { fields: [field] },
        {
          callback: (result) => {
            if (result.error) {
              removeFromActive(fieldSet); // rollback on failure
            }
          },
        }
      );
    }
  }, [
    field,
    isFieldVisible,
    addToActive,
    removeFromActive,
    activateFields,
    deactivateFields,
  ]);

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(TAB_IDS[index]);
  }, []);

  const schemaData =
    labelSchema.currentLabelSchema ?? labelSchema.defaultLabelSchema;

  return (
    <EditContainer>
      <Header field={field} />

      {isM4Enabled && (
        <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.25rem",
            }}
          >
            <Text variant={TextVariant.Lg}>Read-only</Text>
            <Toggle
              size={Size.Md}
              disabled={labelSchema.isReadOnlyRequired}
              checked={labelSchema.isReadOnly}
              onChange={labelSchema.toggleReadOnly}
            />
          </div>
          <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
            When enabled, annotators can view this field but can't edit its
            values.
          </Text>
        </div>
      )}

      {isM4Enabled && (
        <div
          style={{
            borderTop: "1px solid var(--fo-palette-divider)",
            marginBottom: "1rem",
          }}
        />
      )}

      <SchemaSection>
        <Text variant={TextVariant.Lg} style={{ marginBottom: "0.5rem" }}>
          Schema
        </Text>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          {isM4Enabled && (
            <ToggleSwitch
              size={Size.Md}
              defaultIndex={showScanButton ? 1 : 0}
              onChange={handleTabChange}
              tabs={[
                { id: TAB_GUI, data: { label: "GUI" } },
                { id: TAB_JSON, data: { label: "JSON" } },
              ]}
            />
          )}
          {showScanButton && (
            <Button
              size={Size.Md}
              variant={Variant.Secondary}
              onClick={labelSchema.scan}
            >
              <Icon
                name={IconName.Refresh}
                size={Size.Md}
                style={{ marginRight: 4 }}
              />
              Scan
            </Button>
          )}
        </div>

        {isM4Enabled && activeTab === TAB_GUI ? (
          <GUIContent
            field={field}
            config={schemaData}
            scanning={labelSchema.isScanning}
            onConfigChange={labelSchema.updateConfig}
          />
        ) : (
          <JSONEditor
            errors={!!labelSchema.errors.length}
            data={JSON.stringify(schemaData, undefined, 2)}
            onChange={(value) => {
              labelSchema.validate(value);
            }}
            scanning={labelSchema.isScanning}
          />
        )}
      </SchemaSection>

      <Errors errors={labelSchema.errors} />

      <Footer
        leftContent={
          !showScanButton ? (
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Toggle
                size={Size.Md}
                checked={isFieldVisible}
                onChange={handleToggleVisibility}
              />
              <Text variant={TextVariant.Lg}>Visible field</Text>
            </div>
          ) : undefined
        }
        secondaryButton={{
          onClick: labelSchema.discard,
          disabled: !labelSchema.hasChanges,
          text: "Discard",
        }}
        primaryButton={{
          onClick: labelSchema.save,
          disabled:
            labelSchema.isScanning ||
            labelSchema.isValidating ||
            !labelSchema.isValid ||
            !labelSchema.hasChanges,
          text: labelSchema.isSaving ? "Saving..." : "Save",
        }}
      />
    </EditContainer>
  );
};

export default EditFieldLabelSchema;
