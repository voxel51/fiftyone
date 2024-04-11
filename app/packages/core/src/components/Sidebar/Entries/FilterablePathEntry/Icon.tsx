import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import Arrow from "./Arrow";

const Lightning = ({ path }: { path: string }) => {
  const lightning = useRecoilValue(fos.isLightningPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const color = useRecoilValue(fos.pathColor(path));

  return (
    <Arrow
      color={!lightning ? undefined : color}
      unindexed={!lightning}
      expanded={fos.sidebarExpanded({ modal: false, path: expandedPath })}
      id={path}
    />
  );
};

const IconWrapper = ({ modal, path }: { modal: boolean; path: string }) => {
  const disabled = useRecoilValue(fos.isDisabledPath(path));
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const lightning = useRecoilValue(fos.lightning);

  if (lightning && !modal) {
    return <Lightning path={path} />;
  }

  return (
    <Arrow
      disabled={disabled}
      expanded={fos.sidebarExpanded({ modal, path: expandedPath })}
      id={path}
    />
  );
};

export default React.memo(IconWrapper);
