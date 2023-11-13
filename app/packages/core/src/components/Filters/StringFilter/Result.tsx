import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilValue } from "recoil";

const ResultComponent = ({
  value: { value, count },
}: {
  value: { value: string | null; count: number | null };
}) => {
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
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
        }}
      >
        {value}
      </div>
      {isFilterMode && <div style={{ fontSize: "1rem" }}>{count}</div>}
    </div>
  );
};

export default ResultComponent;
