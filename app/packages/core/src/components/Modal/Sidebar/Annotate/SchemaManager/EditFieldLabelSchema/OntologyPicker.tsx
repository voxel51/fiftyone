import {
  Select,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { OntologySummary } from "./useOntologies";

interface OntologyPickerProps {
  ontologies: OntologySummary[] | null;
  isFetching: boolean;
  error: string | null;
  onPick: (value: string) => void;
}

const OntologyPicker = ({
  ontologies,
  isFetching,
  error,
  onPick,
}: OntologyPickerProps) => {
  if (isFetching) {
    return <Spinner size={Size.Md} />;
  }
  if (error) {
    return (
      <Text variant={TextVariant.Md} color={TextColor.Destructive}>
        Failed to load ontologies: {error}
      </Text>
    );
  }
  if (!ontologies?.length) {
    return (
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        No ontologies in this environment yet. Create one via the SDK.
      </Text>
    );
  }

  const options = ontologies.map((o) => ({
    id: o.name,
    data: { label: o.name },
  }));

  return (
    <Select
      exclusive
      portal
      options={options}
      onChange={(v) => onPick(v as string)}
    />
  );
};

export default OntologyPicker;
