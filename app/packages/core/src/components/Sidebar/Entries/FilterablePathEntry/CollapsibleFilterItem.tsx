import * as fos from "@fiftyone/state";
import { makePseudoField } from "@fiftyone/utilities";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import styled, { useTheme } from "styled-components";
import FieldLabelAndInfo from "../../../FieldLabelAndInfo";
import useQueryPerformanceIcon from "../../../Filters/use-query-performance-icon";
import { PathEntryCounts } from "../EntryCounts";
import FilterItem from "./FilterItem";
import Loading from "./Loading";

const Header = styled.div`
  align-items: center;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  user-select: none;
`;

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Right = styled.div`
  align-items: center;
  display: flex;
  flex-shrink: 0;
`;

/**
 * One field of an expanded sidebar entry, collapsed to its name until
 * clicked.
 *
 * A wide container — a dynamic embedded document can carry hundreds of
 * fields — is unreadable as a wall of open filters, and mounting them all
 * pays for every field's aggregation just to look at the list. Collapsed,
 * the row costs a name; the filter and its aggregation wait for intent.
 *
 * Expansion is keyed by the field's own path in the shared sidebar-expanded
 * store, so it survives collapsing and reopening the parent and never
 * collides with the parent's own key.
 */
const CollapsibleFilterItem = ({
  color,
  modal,
  path,
  ...rest
}: React.ComponentProps<typeof FilterItem>) => {
  const [expanded, setExpanded] = fos.useSidebarExpandedState({ modal, path });
  const field = useRecoilValue(fos.field(path)) || makePseudoField(path);
  const icon = useQueryPerformanceIcon(modal, true, path, color);
  const theme = useTheme();
  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;

  return (
    <>
      <Header
        data-cy={`sidebar-filter-field-${path}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <Name ref={hoverTarget}>{label}</Name>
          )}
        />
        <Right>
          {/* In the grid this is gated on the path's expanded state, so a
              collapsed row pays for no aggregation. */}
          <Suspense>
            <PathEntryCounts modal={modal} path={path} />
          </Suspense>
          {icon}
          <Arrow
            data-cy={`sidebar-filter-field-arrow-${path}`}
            style={{ margin: 0, color: theme.text.secondary }}
          />
        </Right>
      </Header>
      {expanded && (
        // Per-field boundary: a suspending aggregation must not blank out
        // the sibling rows the user is reading.
        <Suspense fallback={<Loading />}>
          <FilterItem
            color={color}
            modal={modal}
            path={path}
            {...rest}
            named={false}
          />
        </Suspense>
      )}
    </>
  );
};

export default CollapsibleFilterItem;
