import { MenuItem, Select, TextField } from "@mui/material";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { activeLabelSchemas, inactiveLabelSchemas } from "../../state";
import FieldRow from "../FieldRow";
import { FieldColumn, Label } from "../styled";

export default function ({
  field,
  setField,
}: {
  field: string;
  setField: () => void;
}) {
  const activeFields = useAtomValue(activeLabelSchemas);
  const hiddenFields = useAtomValue(inactiveLabelSchemas);

  // All fields for the dropdown
  const allFields = useMemo(
    () => [...activeFields, ...hiddenFields].sort(),
    [activeFields, hiddenFields]
  );

  return (
    <FieldRow style={{ marginTop: "1rem" }}>
      <FieldColumn>
        <Label variant="body2">Field name</Label>
        <Select
          fullWidth
          size="small"
          value={field}
          onChange={(e) => setField(e.target.value as string)}
        >
          {allFields.map((field) => (
            <MenuItem key={field} value={field}>
              {field}
            </MenuItem>
          ))}
        </Select>
      </FieldColumn>
      <FieldColumn>
        <Label variant="body2">Field type</Label>
        <TextField
          fullWidth
          size="small"
          value={""}
          disabled
          InputProps={{ readOnly: true }}
        />
      </FieldColumn>
    </FieldRow>
  );
}
