/**
 * The schema row: the schema lens dropdown (layers icon + current
 * schema + chevron; "Manage schema" lives inside its menu for schema
 * managers). Rendered in the grid sidebar between the saved-view
 * selector and the Filter / Visibility row, and in the sample modal
 * above the Explore groups and the Annotate "Create" section. Only on
 * the Samples tab — inside a workflow task the stage schema governs and
 * the row is absent (the "Create" row keeps its own gear there, still
 * MANAGE-only). Returning to the dataset default is a menu choice, not
 * a separate control.
 */

import styled from "styled-components";
import SchemaLensSelector, {
  useSchemaLensAvailable,
} from "./Entries/SchemaLensSelector";

const Row = styled.div<{ $padded: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: ${({ $padded }) => ($padded ? "0 1rem 0.5rem" : "0")};
  width: 100%;
  box-sizing: border-box;
`;

const SchemaLensRow = ({
  padded = true,
}: {
  /** Side padding; off where the parent already insets its rows (the grid). */
  padded?: boolean;
}) => {
  const { available } = useSchemaLensAvailable();

  if (!available) return null;

  return (
    <Row data-cy="schema-lens-row" $padded={padded}>
      <SchemaLensSelector maxValueWidth={180} />
    </Row>
  );
};

export default SchemaLensRow;
