import * as fos from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import React from "react";
import { useRecoilValue } from "recoil";
import Arrow from "./Arrow";

const Lightning = ({
  path,
  frameFilteringDisabled,
}: {
  path: string;
  frameFilteringDisabled: boolean;
}) => {
  const indexed = useRecoilValue(fos.isIndexedPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));

  return (
    <>
      <Bolt />
      <Arrow
        unindexed={!indexed}
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
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const frameFilteringDisabled =
    useRecoilValue(fos.isDisabledFrameFilterPath(path)) && !modal;

  if (queryPerformance && !modal) {
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
