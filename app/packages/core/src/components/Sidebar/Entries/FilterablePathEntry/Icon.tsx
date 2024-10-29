import { Tooltip } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import React from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import Arrow from "./Arrow";

export const LightningBolt = styled(Bolt)`
  color: ${({ theme }) => theme.text.secondary};
`;

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
      <Tooltip placement="top-center" text={"Indexed"}>
        <LightningBolt style={{ height: 16, marginRight: 2, width: 16 }} />
      </Tooltip>
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

  if (queryPerformance && indexed && !modal) {
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
