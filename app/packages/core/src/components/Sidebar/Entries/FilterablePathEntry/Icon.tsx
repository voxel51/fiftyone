import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";
import { pathIsExpanded } from "../utils";
import Arrow from "./Arrow";
import Lock from "./Lock";

const Icon = ({ modal, path }: { modal: boolean; path: string }) => {
  const expandedPath = useRecoilValue(fos.expandPath(path));

  return (
    <Arrow expanded={pathIsExpanded({ modal, path: expandedPath })} id={path} />
  );
};

const Locked = ({ path }: { path: string }) => {
  const lightning = useRecoilValue(fos.isLightningPath(path));

  return !lightning ? <Lock /> : <Icon modal={false} path={path} />;
};

const LightningCheck = ({
  children,
  path,
}: React.PropsWithChildren<{ path: string }>) => {
  const lightning = true;
  if (!lightning) {
    return <>{children}</>;
  }
  return <Locked path={path} />;
};

const IconWrapper = ({
  disabled,
  modal,
  path,
}: {
  disabled: boolean;
  modal: boolean;
  path: string;
}) => {
  if (disabled) {
    return null;
  }

  const icon = <Icon modal={modal} path={path} />;

  if (!modal) {
    return <LightningCheck path={path}>{icon}</LightningCheck>;
  }

  return icon;
};

export default React.memo(IconWrapper);
