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
import OntologyPicker from "../EditFieldLabelSchema/OntologyPicker";
import { ONTOLOGY_TYPE, useOntologies } from "../EditFieldLabelSchema/useOntologies";

interface NewFieldOntologySectionProps {
  appliedOntology?: string;
  // Names of the ontology-owned attributes, shown in the disconnect modal.
  ontologyAttributes: string[];
  onPick: (name: string) => void;
  onClear: () => void;
}

/**
 * Ontology picker for the new-field flow.
 *
 * A props-driven sibling of {@link ApplyOntologySection}: it owns no schema
 * state (the create form keeps that in local React state), and instead reports
 * picks/clears up to the parent. The picker, ontology list, and disconnect
 * confirmation are all shared with the edit flow.
 */
const NewFieldOntologySection = ({
  appliedOntology,
  ontologyAttributes,
  onPick,
  onClear,
}: NewFieldOntologySectionProps) => {
  const { ontologies, isFetching, error } = useOntologies(
    ONTOLOGY_TYPE.ontology
  );
  const [pickerArmed, setPickerArmed] = useState(false);

  const expanded = !!appliedOntology || pickerArmed;

  const { confirmDisconnect, DisconnectOntologyModal } =
    useConfirmDisconnectOntology(() => {
      onClear();
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
    onPick(value);
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
          type={ONTOLOGY_TYPE.ontology}
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

export default NewFieldOntologySection;
