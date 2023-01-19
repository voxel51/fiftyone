import React from "react";
import { V } from "./CategoricalFilter";

const ResultComponent = ({ value: { value, count } }: { value: V }) => {
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
      <div style={{ fontSize: "1rem" }}>{count}</div>
    </div>
  );
};

export default ResultComponent;
