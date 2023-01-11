import { V } from "./CategoricalFilter";

const ResultComponent = ({ value: { value, count } }: { value: V }) => {
  return (
    <div>
      <span
        style={{
          fontSize: "1rem",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: "1rem" }}>{count}</span>
    </div>
  );
};

export default ResultComponent;
