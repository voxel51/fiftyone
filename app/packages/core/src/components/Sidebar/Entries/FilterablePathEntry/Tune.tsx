import { useTheme } from "@fiftyone/components";
import { Tune } from "@mui/icons-material";
import React from "react";
import { RecoilState, useSetRecoilState } from "recoil";

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

  return (
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
          setExpanded((v) => !v);
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
};
