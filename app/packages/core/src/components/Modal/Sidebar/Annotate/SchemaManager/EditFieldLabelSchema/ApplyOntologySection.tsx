import OntologySection from "./OntologySection";
import { useAppliedOntology } from "./useLabelSchema";

interface ApplyOntologySectionProps {
  field: string;
}

/**
 * Edit-flow ontology picker: wires the live schema state from
 * {@link useAppliedOntology} into the shared {@link OntologySection}.
 */
const ApplyOntologySection = ({ field }: ApplyOntologySectionProps) => {
  const { appliedOntology, ontologyAttributes, applyOntology, clearOntology } =
    useAppliedOntology(field);

  return (
    <OntologySection
      appliedOntology={appliedOntology}
      ontologyAttributes={ontologyAttributes}
      onPick={applyOntology}
      onClear={clearOntology}
    />
  );
};

export default ApplyOntologySection;
