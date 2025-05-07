import { Tooltip } from "@fiftyone/components";
import { QuestionMark } from "@mui/icons-material";
import React from "react";
import { useTheme } from "styled-components";

const TimedOut = ({ queryTime }: { queryTime: number }) => {
  const theme = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Tooltip
        placement="top-center"
        text={`Query timed out at ${queryTime} second${
          queryTime > 1 ? "s" : ""
        }`}
      >
        <QuestionMark
          style={{
            marginRight: 2,
            color: theme.text.secondary,
            height: 14,
            width: 14,
          }}
        />
      </Tooltip>
    </div>
  );
};

export default TimedOut;
