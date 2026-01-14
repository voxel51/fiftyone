import { Input, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import {
  activeLabelSchemas,
  fieldType,
  inactiveLabelSchemas,
} from "../../state";
import { FieldColumn, FieldRow } from "../styled";

export default function Header({
  field,
  setField,
}: {
  field: string;
  setField: (field: string) => void;
}) {
  const activeFields = useAtomValue(activeLabelSchemas);
  const hiddenFields = useAtomValue(inactiveLabelSchemas);
  const fType = useAtomValue(fieldType(field));

  // All fields for the dropdown
  const allFields = useMemo(
    () => [...(activeFields ?? []), ...hiddenFields].sort(),
    [activeFields, hiddenFields]
  );

  return (
    <FieldRow style={{ marginTop: "1rem" }}>
      <FieldColumn>
        <Text
          variant={TextVariant.Xl}
          color={TextColor.Secondary}
          className="mb-2 block"
        >
          Field name
        </Text>
        <Select
          exclusive
          value={field}
          onChange={(value) => {
            if (typeof value === "string") {
              setField(value);
            }
          }}
          options={allFields.map((f) => ({
            id: f,
            data: { label: f },
          }))}
        />
      </FieldColumn>
      <FieldColumn>
        <Text
          variant={TextVariant.Xl}
          color={TextColor.Secondary}
          className="mb-2 block"
        >
          Field type
        </Text>
        <Input value={fType || ""} disabled readOnly />
      </FieldColumn>
    </FieldRow>
  );
}
