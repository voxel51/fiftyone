import {
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
} from "@voxel51/voodo";
import { useState } from "react";
import { useConfirmDisconnectOntology } from "../../Confirmation/useConfirmDisconnectOntology";
import OntologyPicker from "./OntologyPicker";
import { useAppliedOntology } from "./useLabelSchema";
import { ONTOLOGY_TYPE_ONTOLOGY, useOntologies } from "./useOntologies";

interface ApplyOntologySectionProps {
  field: string;
}

const ApplyOntologySection = ({ field }: ApplyOntologySectionProps) => {
  const { appliedOntology, ontologyAttributes, applyOntology, clearOntology } =
    useAppliedOntology(field);
  const { ontologies, isFetching, error } = useOntologies(
    ONTOLOGY_TYPE_ONTOLOGY
  );
  const [pickerArmed, setPickerArmed] = useState(false);

  const expanded = !!appliedOntology || pickerArmed;

  const { confirmDisconnect, DisconnectOntologyModal } =
    useConfirmDisconnectOntology(() => {
      clearOntology();
      setPickerArmed(false);
    }, ontologyAttributes);

  const handleToggle = (): void => {
    if (expanded) {
      if (appliedOntology) {
        confirmDisconnect();
      } else {
        setPickerArmed(false);
      }
    } else {
      setPickerArmed(true);
    }
  };

  const handlePick = (value: string): void => {
    applyOntology(value);
    setPickerArmed(false);
  };

  return (
    <Stack
      orientation={Orientation.Column}
      spacing={Spacing.Xs}
      style={{ marginTop: "1rem", marginBottom: "1rem" }}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Text variant={TextVariant.Lg}>Ontology</Text>
        <Toggle size={Size.Md} checked={expanded} onChange={handleToggle} />
      </Stack>
      <Text variant={TextVariant.Lg} color={TextColor.Secondary}>
        {appliedOntology
          ? `Chosen ontology: ${appliedOntology}`
          : "When enabled, your schema will use attributes defined in the ontology."}
      </Text>

      {expanded && !appliedOntology && (
        <OntologyPicker
          type={ONTOLOGY_TYPE_ONTOLOGY}
          ontologies={ontologies}
          isFetching={isFetching}
          error={error}
          onPick={handlePick}
        />
      )}
      {DisconnectOntologyModal}
    </Stack>
  );
};

export default ApplyOntologySection;
