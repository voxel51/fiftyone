import { Sync } from "@mui/icons-material";
import {
  Button,
  Size,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Variant,
} from "@voxel51/voodo";
import { useSetAtom } from "jotai";
import Footer from "../Footer";
import { EditContainer, Label, SchemaSection, TabsRow } from "../styled";
import Errors from "./Errors";
import Header from "./Header";
import JSONEditor from "./JSONEditor";
import useLabelSchema from "./useLabelSchema";
import { currentField } from "../state";

const EditFieldLabelSchema = ({ field }: { field: string }) => {
  const labelSchema = useLabelSchema(field);
  const setCurrentField = useSetAtom(currentField);

  return (
    <EditContainer>
      {/* Field name and type header */}
      <Header field={field} setField={setCurrentField} />

      {/* Read-only toggle */}
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

      {/* Schema section - JSON only */}
      <SchemaSection>
        <TabsRow>
          <Label variant="body2">Schema</Label>
          <Button
            size={Size.Sm}
            variant={Variant.Secondary}
            onClick={labelSchema.scan}
          >
            <Sync fontSize="small" style={{ marginRight: 4 }} />
            Scan
          </Button>
        </TabsRow>

        <JSONEditor
          errors={!!labelSchema.errors.length}
          data={JSON.stringify(
            labelSchema.currentLabelSchema ?? labelSchema.defaultLabelSchema,
            undefined,
            2
          )}
          onChange={(value) => {
            labelSchema.validate(value);
          }}
          scanning={labelSchema.isScanning}
        />
      </SchemaSection>

      <Errors errors={labelSchema.errors} />

      <Footer
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
