import * as fos from "@fiftyone/state";
import { KeyboardArrowDown, KeyboardArrowUp, Lock } from "@mui/icons-material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { pathIsExpanded } from "../utils";

const Icon = ({ modal, path }: { modal: boolean; path: string }) => {
  const expandedPath = useRecoilValue(fos.expandPath(path));
  const [expanded, setExpanded] = useRecoilState(
    pathIsExpanded({ modal, path: expandedPath })
  );

  const Arrow = expanded ? KeyboardArrowUp : KeyboardArrowDown;
  return (
    <Arrow
      key="arrow"
      data-cy={`sidebar-field-arrow-${path}`}
      style={{ cursor: "pointer", margin: 0 }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setExpanded(!expanded);
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
      onMouseUp={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    />
  );
};

const Locked = ({ path }: { path: string }) => {
  const lightning = useRecoilValue(fos.isLightningPath(path));

  return !lightning ? (
    <Lock
      style={{
        padding: 3,
        margin: 0,
        color: "var(--fo-palette-text-secondary)",
      }}
    />
  ) : (
    <Icon modal={false} path={path} />
  );
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
