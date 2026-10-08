import { Stack, Typography } from "@mui/material";

/**
 * Component which wraps a field in an optional label and description.
 *
 * @param label Optional field label
 * @param formControl Field form control
 * @param description Optional field description
 *
 * @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead.
 */
export const LabeledField = ({
  formControl,
  label,
  description,
}: {
  formControl: React.ReactNode;
  label?: React.ReactNode;
  description?: string;
}) => {
  return (
    <Stack direction="column" spacing={1}>
      {label && <Typography>{label}</Typography>}
      {formControl}
      {description && (
        <Typography color="secondary" variant="subtitle2">
          {description}
        </Typography>
      )}
    </Stack>
  );
};

export default LabeledField;
