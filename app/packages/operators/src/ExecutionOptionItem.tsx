import { useTheme } from "@fiftyone/components";

export default function ExecutionOptionItem({ label, tag, disabled }) {
  const theme = useTheme();
  const tagEl = tag ? (
    <span
      style={{
        fontSize: "11px",
        color: disabled ? theme.text.secondary : theme.custom.primarySoft,
        marginLeft: "5px",
      }}
    >
      {tag}
    </span>
  ) : null;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {label}
      {tagEl}
    </div>
  );
}
