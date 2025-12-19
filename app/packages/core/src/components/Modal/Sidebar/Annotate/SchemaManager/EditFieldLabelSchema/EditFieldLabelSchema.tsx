import { Sync } from "@mui/icons-material";
import { Box, Button, Switch, Typography } from "@mui/material";
import Footer from "../Footer";
import { EditContainer, Label, SchemaSection, TabsRow } from "../styled";
import Errors from "./Errors";
import JSONEditor from "./JSONEditor";
import useLabelSchema from "./useLabelSchema";

const EditFieldLabelSchema = ({
  field,
}: {
  field: string;
  setField: (field: string) => void;
}) => {
  const labelSchema = useLabelSchema(field);
  return (
    <EditContainer>
      {/* Read-only toggle */}
      <Box my={2}>
        <Typography fontWeight={500}>Read-only</Typography>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="body2" color="secondary">
            When enabled, annotators can view this field but can't edit its
            values.
          </Typography>
          <Switch
            key={labelSchema.isReadOnly}
            disabled={labelSchema.isReadOnlyRequired}
            checked={labelSchema.isReadOnly}
            onChange={labelSchema.toggleReadOnly}
          />
        </Box>
      </Box>

      {/* Schema section */}
      <SchemaSection>
        <Label variant="body2">Schema</Label>
        <TabsRow>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Sync fontSize="small" />}
            onClick={labelSchema.scan}
            sx={{
              color: "text.primary",
              borderColor: "divider",
              textTransform: "none",
              "&:hover": {
                borderColor: "action.active",
              },
              "&:active": {
                borderColor: "action.active",
              },
            }}
          >
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
          text: labelSchema.isScanning ? "Saving..." : "Save",
        }}
      />
    </EditContainer>
  );
};

export default EditFieldLabelSchema;
