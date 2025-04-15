import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Arrow from "./Arrow";

const LightningIcon = styled(Bolt)`
  color: ${({ theme }) => theme.text.secondary};
`;

export const LightningBolt = ({
  color,
  tooltip,
}: {
  color?: string;
  tooltip?: string;
}) => {
  return (
    <Tooltip placement="top-center" text={tooltip}>
      <LightningIcon
        data-cy={"query-performance"}
        style={{ height: 16, marginRight: 2, width: 16, color }}
      />
    </Tooltip>
  );
};

const Lightning = ({
  path,
  frameFilteringDisabled,
}: {
  path: string;
  frameFilteringDisabled: boolean;
}) => {
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const filteredIndex = useRecoilValue(
    fos.pathHasIndexes({ path, withFilters: true })
  );
  const hasFilters = useRecoilValue(fos.hasFilters(false));
  const color = useRecoilValue(fos.pathColor(path));
  const isFiltered = useRecoilValue(
    fos.fieldIsFiltered({ path, modal: false })
  );

  return (
    <>
      <LightningBolt
        color={(filteredIndex && hasFilters) || isFiltered ? color : undefined}
        tooltip={filteredIndex ? "Compound index" : "Indexed"}
      />
      <Arrow
        expanded={fos.sidebarExpanded({ modal: false, path: expandedPath })}
        id={path}
        frameFilterDisabledPath={frameFilteringDisabled}
      />
    </>
  );
};

const IconWrapper = ({ modal, path }: { modal: boolean; path: string }) => {
  const disabled = useRecoilValue(fos.isDisabledFilterPath(path)) && !modal;
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const frameFilteringDisabled =
    useRecoilValue(fos.isDisabledFrameFilterPath(path)) && !modal;
  const indexed = useRecoilValue(fos.pathHasIndexes({ path }));
  const filteredIndex = useRecoilValue(
    fos.pathHasIndexes({ path, withFilters: true })
  );
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const frameField = useRecoilValue(fos.isFrameField(path));

  if (queryPerformance && (indexed || filteredIndex) && !modal && !frameField) {
    return (
      <Lightning path={path} frameFilteringDisabled={frameFilteringDisabled} />
    );
  }

  return (
    <Arrow
      disabled={disabled}
      expanded={fos.sidebarExpanded({ modal, path: expandedPath })}
      frameFilterDisabledPath={frameFilteringDisabled}
      id={path}
    />
  );
};

export default React.memo(IconWrapper);
