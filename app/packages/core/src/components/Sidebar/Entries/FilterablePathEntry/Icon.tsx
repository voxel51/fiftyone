import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Arrow from "./Arrow";

export const LightningIcon = styled(Bolt)`
  color: ${({ theme }) => theme.text.secondary};
`;

export const LightningBolt: React.FC = (_) => {
  return (
    <Tooltip placement="top-center" text={"Indexed"}>
      <LightningIcon style={{ height: 16, marginRight: 2, width: 16 }} />
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

  return (
    <>
      <LightningBolt />
      <Arrow
        expanded={fos.sidebarExpanded({ modal: false, path: expandedPath })}
        id={path}
        frameFilterDisabledPath={frameFilteringDisabled}
      />
    </>
  );
};

const IconWrapper = ({ modal, path }: { modal: boolean; path: string }) => {
  const disabled = useRecoilValue(fos.isDisabledFilterPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const frameFilteringDisabled =
    useRecoilValue(fos.isDisabledFrameFilterPath(path)) && !modal;
  const indexed = useRecoilValue(fos.pathHasIndexes(path));
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const frameField = useRecoilValue(fos.isFrameField(path));

  if (queryPerformance && indexed && !modal && !frameField) {
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
