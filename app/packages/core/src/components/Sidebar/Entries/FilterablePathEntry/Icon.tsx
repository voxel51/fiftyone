import * as fos from "@fiftyone/state";
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
  const lightning = useRecoilValue(fos.isLightningPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const color = useRecoilValue(fos.pathColor(path));

  return (
    <Arrow
      color={!lightning ? undefined : color}
      unindexed={!lightning}
      expanded={fos.sidebarExpanded({ modal: false, path: expandedPath })}
      id={path}
      frameFilterDisabledPath={frameFilteringDisabled}
    />
  );
};

const IconWrapper = ({ modal, path }: { modal: boolean; path: string }) => {
  const disabled = useRecoilValue(fos.isDisabledFilterPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const lightning = useRecoilValue(fos.lightning);
  const frameFilteringDisabled =
    useRecoilValue(fos.isDisabledFrameFilterPath(path)) && !modal;

  if (lightning && !modal) {
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
