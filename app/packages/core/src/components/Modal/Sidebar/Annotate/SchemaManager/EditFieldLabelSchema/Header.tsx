import { Input, Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useFieldType } from "../hooks";
import { FieldColumn, FieldRow } from "../styled";

export default function Header({ field }: { field: string }) {
  const fType = useFieldType(field);

  return (
    <FieldRow style={{ marginTop: "1rem" }}>
      <FieldColumn>
        <Text
          variant={TextVariant.Lg}
          color={TextColor.Primary}
          className="mb-2 block"
        >
          Field name
        </Text>
        <Input value={field} disabled readOnly />
      </FieldColumn>
      <FieldColumn>
        <Text
          variant={TextVariant.Lg}
          color={TextColor.Primary}
          className="mb-2 block"
        >
          Field type
        </Text>
        <Input value={fType || ""} disabled readOnly />
      </FieldColumn>
    </FieldRow>
  );
}
