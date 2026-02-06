import { FeatureFlag, useFeature } from "@fiftyone/feature-flags";
import { OperatorExecutionTrigger } from "@fiftyone/operators/src/components/OperatorExecutionTrigger";
import {
  Button,
  Icon,
  IconName,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ToggleSwitch,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useState } from "react";
import { TAB_GUI, TAB_IDS, TAB_JSON, TabId } from "../constants";
import { useToggleFieldVisibility } from "../hooks";
import Footer from "../Footer";
import { EditContainer, SchemaSection } from "../styled";
import Errors from "./Errors";
import GUIContent from "./GUIContent";
import Header from "./Header";
import JSONEditor from "./JSONEditor";
import useLabelSchema from "./useLabelSchema";

const GENERATE_LABEL_SCHEMAS_OPERATOR = "generate_label_schemas";

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
  const { isActive: isFieldVisible, toggle: handleToggleVisibility } =
    useToggleFieldVisibility(field);

  const handleTabChange = useCallback(
    (index: number) => {
      setActiveTab(TAB_IDS[index]);
      labelSchema.resetErrors();
    },
    [labelSchema.resetErrors]
  );

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
            <OperatorExecutionTrigger
              operatorUri={GENERATE_LABEL_SCHEMAS_OPERATOR}
              executionParams={labelSchema.scanParams}
              onSuccess={labelSchema.onScanSuccess}
              onError={labelSchema.onScanError}
              onOptionSelected={labelSchema.onScanStart}
              disabled={labelSchema.isScanning}
              insideModal
            >
              <Button
                data-cy={"scan"}
                size={Size.Md}
                variant={Variant.Secondary}
                disabled={labelSchema.isScanning}
              >
                <Icon
                  name={IconName.Refresh}
                  size={Size.Md}
                  style={{ marginRight: 4 }}
                />
                {labelSchema.isScanning ? "Scanning..." : "Scan"}
              </Button>
            </OperatorExecutionTrigger>
          )}
        </div>

        {isM4Enabled && activeTab === TAB_GUI ? (
          <GUIContent
            field={field}
            config={labelSchema.currentLabelSchema}
            scanning={labelSchema.isScanning}
            onConfigChange={labelSchema.updateConfig}
          />
        ) : (
          <JSONEditor
            key={labelSchema.editorKey}
            errors={!!labelSchema.errors.length}
            data={labelSchema.currentLabelSchema}
            onChange={labelSchema.validate}
            scanning={labelSchema.isScanning}
          />
        )}
      </SchemaSection>

      <Errors errors={labelSchema.errors} />

      <Footer
        leftContent={
          !showScanButton ? (
            <Stack
              orientation={Orientation.Row}
              spacing={Spacing.Sm}
              style={{ alignItems: "center" }}
            >
              <Toggle
                data-cy={"toggle-visibility"}
                size={Size.Md}
                checked={isFieldVisible}
                onChange={handleToggleVisibility}
              />
              <Text variant={TextVariant.Lg}>Visible field</Text>
            </Stack>
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
