import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";

export type Result = { value: string | null; count: number | null };

const ResultComponent = ({ value: { value, count } }: { value: Result }) => {
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const theme = useTheme();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        flexDirection: "row",
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: "1rem",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          color: value === null ? theme.text.disabled : undefined,
        }}
      >
        {value === null ? "None" : value}
      </div>
      {isFilterMode && <div style={{ fontSize: "1rem" }}>{count}</div>}
    </div>
  );
};

export default ResultComponent;
