import {
  Select,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import type { OntologySummary, OntologyType } from "./useOntologies";

interface OntologyPickerProps {
  ontologies: OntologySummary[] | null;
  isFetching: boolean;
  error: string | null;
  onPick: (value: string) => void;
  type?: OntologyType;
  value?: string;
}

const OntologyPicker = ({
  ontologies,
  isFetching,
  error,
  onPick,
  type = "annotation_ontology",
  value,
}: OntologyPickerProps) => {
  const label = type === "taxonomy" ? "taxonomies" : "ontologies";

  if (isFetching) {
    return <Spinner size={Size.Md} />;
  }
  if (error) {
    return (
      <Text variant={TextVariant.Md} color={TextColor.Destructive}>
        Failed to load {label}: {error}
      </Text>
    );
  }
  if (!ontologies?.length) {
    return (
      <Text variant={TextVariant.Md} color={TextColor.Secondary}>
        No {label} in this environment yet. Create one via the SDK.
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
      value={value}
      options={options}
      onChange={(v) => onPick(v as string)}
    />
  );
};

export default OntologyPicker;
