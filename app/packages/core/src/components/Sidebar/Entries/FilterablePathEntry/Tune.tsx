import { Tooltip, useTheme } from "@fiftyone/components";
import { Tune } from "@mui/icons-material";
import React from "react";
import type { RecoilState } from "recoil";
import { useSetRecoilState } from "recoil";
import { QP_MODE } from "../../../../utils/links";
import DisabledReason from "./DisabledReason";

export default ({
  color,
  disabled,
  expanded,
}: {
  color?: string;
  disabled?: boolean;
  expanded: RecoilState<boolean>;
}) => {
  const setExpanded = useSetRecoilState(expanded);

  const theme = useTheme();

  const children = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Tune
        style={{
          padding: 2,
          margin: 0,
          cursor: disabled ? undefined : "pointer",
          color: disabled ? theme.text.secondary : color,
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          !disabled && setExpanded((v) => !v);
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
    </div>
  );

  if (disabled) {
    return (
      <Tooltip
        text={<DisabledReason href={QP_MODE} text={"add an index"} />}
        placement="top-center"
      >
        {children}
      </Tooltip>
    );
  }

  return <>{children}</>;
};
