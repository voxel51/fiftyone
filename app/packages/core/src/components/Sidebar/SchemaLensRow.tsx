/**
 * The schema row: the schema lens dropdown (layers icon + current
 * schema + chevron; "Manage schema" lives inside its menu for schema
 * managers) and, on the right, a reset control that returns to the
 * dataset default. Rendered in the grid sidebar between the saved-view
 * selector and the Filter / Visibility row, and in the sample modal
 * above the Explore groups and the Annotate "Create" section. Only on
 * the Samples tab — inside a workflow task the stage schema governs and
 * the row is absent (the "Create" row keeps its own gear there, still
 * MANAGE-only).
 */

import * as fos from "@fiftyone/state";
import {
  Anchor,
  Button,
  CloseIcon,
  Size,
  Text,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useRecoilState } from "recoil";
import styled from "styled-components";
import SchemaLensSelector, {
  ALL_FIELDS_LENS,
  useSchemaLensAvailable,
} from "./Entries/SchemaLensSelector";

const Row = styled.div<{ $padded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  const { available, datasetName } = useSchemaLensAvailable();
  const [lens, setLens] = useRecoilState(fos.schemaLens);

  if (!available) return null;

  const onDefault =
    !lens || lens.dataset !== datasetName || lens.docId === ALL_FIELDS_LENS;

  return (
    <Row data-cy="schema-lens-row" $padded={padded}>
      <SchemaLensSelector maxValueWidth={180} />
      <Tooltip
        anchor={Anchor.Bottom}
        content={<Text>Back to the default schema</Text>}
        portal
      >
        <Button
          variant={Variant.Icon}
          borderless
          data-cy="schema-lens-reset"
          aria-label="Back to the default schema"
          disabled={onDefault}
          onClick={() => setLens(null)}
        >
          <CloseIcon size={Size.Sm} />
        </Button>
      </Tooltip>
    </Row>
  );
};

export default SchemaLensRow;
