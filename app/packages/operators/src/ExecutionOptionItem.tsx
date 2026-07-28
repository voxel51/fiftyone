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
  // Use an inline-level wrapper so this component can be rendered
  // inside phrasing content (e.g. MUI <Typography>, which defaults to
  // <p>). A <div> here produced "<div> cannot appear as a descendant
  // of <p>" warnings in callers like OperatorExecutionMenu.
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      {label}
      {tagEl}
    </span>
  );
}
