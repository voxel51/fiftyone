import type { useTheme } from "@fiftyone/components";

/** Inline styles shared by the Schema Manager overview and its parts. */
export function makeStyles(theme: ReturnType<typeof useTheme>) {
  const onSurface = theme.text.primary;
  const onSurfaceMuted = theme.text.secondary;

  return {
    bar: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    fieldName: {
      fontSize: 13,
      color: onSurface,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
    emptyText: {
      fontSize: 12,
      color: onSurfaceMuted,
      padding: "4px 2px 8px",
    },
    errorText: {
      fontSize: 12,
      color: theme.error.main,
      padding: "2px 2px 6px",
    },
  };
}

export type OverviewStyles = ReturnType<typeof makeStyles>;
