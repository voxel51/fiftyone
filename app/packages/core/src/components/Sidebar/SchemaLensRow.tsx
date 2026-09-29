/**
 * The schema row: the schema lens dropdown on the left and, for schema
 * managers, the Schema Manager gear on the right (the same gear as the
 * sample modal's Annotate "Create" row). Rendered in the grid sidebar
 * between the saved-view selector and the Filter / Visibility row, and
 * in the sample modal above the Explore groups and the Annotate
 * "Create" section. Only on the Samples tab — inside a workflow task
 * the stage schema governs and the row is absent (the "Create" row
 * keeps its own gear there, still MANAGE-only).
 */

import {
  Anchor,
  Button,
  Icon,
  IconName,
  Size,
  Text,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import styled from "styled-components";
import { useSchemaManagerModal } from "../Modal/Sidebar/Annotate/SchemaManager/hooks";
import useCanManageSchema from "../Modal/Sidebar/Annotate/useCanManageSchema";
import SchemaLensSelector, {
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
  const { available } = useSchemaLensAvailable();
  const canManage = useCanManageSchema();
  const { openSchemaManager } = useSchemaManagerModal();

  if (!available) return null;

  return (
    <Row data-cy="schema-lens-row" $padded={padded}>
      <SchemaLensSelector maxValueWidth={200} />
      {canManage ? (
        <Tooltip
          anchor={Anchor.Bottom}
          content={<Text>Open schema manager</Text>}
          portal
        >
          <Button
            variant={Variant.Icon}
            borderless
            data-cy="open-schema-manager"
            aria-label="Open schema manager"
            onClick={() => openSchemaManager()}
          >
            <Icon name={IconName.Settings} size={Size.Md} />
          </Button>
        </Tooltip>
      ) : null}
    </Row>
  );
};

export default SchemaLensRow;
