import { Sync } from "@mui/icons-material";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  ToggleSwitch,
  Variant,
} from "@voxel51/voodo";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { activeLabelSchemas } from "../../state";
import Footer from "../Footer";
import { EditContainer, Label, SchemaSection, TabsRow } from "../styled";
import Errors from "./Errors";
import GUIContent from "./GUIContent";
import Header from "./Header";
import JSONEditor from "./JSONEditor";
import useLabelSchema from "./useLabelSchema";
import { currentField } from "../state";

const TAB_IDS = ["gui", "json"] as const;
type TabId = typeof TAB_IDS[number];

const EditFieldLabelSchema = ({ field }: { field: string }) => {
  const labelSchema = useLabelSchema(field);
  const setCurrentField = useSetAtom(currentField);
  const [activeTab, setActiveTab] = useState<TabId>("gui");
  const activeFields = useAtomValue(activeLabelSchemas);
  const isFieldVisible = activeFields?.includes(field) ?? false;

  const handleTabChange = useCallback((index: number) => {
    setActiveTab(TAB_IDS[index]);
  }, []);

  const schemaData =
    labelSchema.currentLabelSchema ?? labelSchema.defaultLabelSchema;

  return (
    <EditContainer>
      <Header field={field} setField={setCurrentField} />

      <div className="my-4">
        <div className="flex items-center justify-between mb-1">
          <Text variant={TextVariant.Xl}>Read-only</Text>
          <Toggle
            size={Size.Sm}
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

      <SchemaSection>
        <Label variant="body2">Schema</Label>
        <TabsRow>
          <ToggleSwitch
            size={Size.Sm}
            defaultIndex={0}
            onChange={handleTabChange}
            tabs={[
              { id: "gui", data: { label: "GUI" } },
              { id: "json", data: { label: "JSON" } },
            ]}
          />
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={labelSchema.scan}
          >
            <Sync fontSize="small" style={{ marginRight: 4 }} />
            Scan
          </Button>
        </TabsRow>

        {activeTab === "gui" ? (
          <GUIContent
            config={schemaData}
            scanning={labelSchema.isScanning}
            onClassOrderChange={labelSchema.updateClassOrder}
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Toggle
              size={Size.Sm}
              checked={isFieldVisible}
              onChange={() => {
                // TODO: Toggle field visibility
              }}
            />
            <Text variant={TextVariant.Lg}>Visible field</Text>
          </div>
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
