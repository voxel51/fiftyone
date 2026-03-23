/**
 * Utility layout components that replace raw `<div style={s.*}>` usage.
 *
 * Each wraps a simple `div` with the corresponding CSSProperties from
 * the old styles.ts, keeping components focused on logic rather than
 * layout plumbing.
 */
import React, { CSSProperties, HTMLAttributes, forwardRef } from "react";

// ─── Helpers ────────────────────────────────────────────────────────

type DivProps = HTMLAttributes<HTMLDivElement>;

function styled(baseStyle: CSSProperties) {
  const Component = forwardRef<HTMLDivElement, DivProps>(
    ({ style, ...props }, ref) => (
      <div ref={ref} style={{ ...baseStyle, ...style }} {...props} />
    )
  );
  return Component;
}

// ─── Shared / Reusable ──────────────────────────────────────────────

export const FullCenter = styled({
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});
FullCenter.displayName = "FullCenter";

export const FullSize = styled({
  width: "100%",
  height: "100%",
});
FullSize.displayName = "FullSize";

export const Divider = styled({
  borderTop: "1px solid var(--fo-palette-divider)",
});
Divider.displayName = "Divider";

// ─── RunList ────────────────────────────────────────────────────────

export const RunListContainer = styled({
  padding: 16,
  height: "100%",
  display: "flex",
  flexDirection: "column",
});
RunListContainer.displayName = "RunListContainer";

export const SelectAllRow = styled({
  marginBottom: 8,
});
SelectAllRow.displayName = "SelectAllRow";

export const EmptyStateBox = styled({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  gap: 8,
});
EmptyStateBox.displayName = "EmptyStateBox";

export const ActionButtons = styled({
  display: "flex",
});
ActionButtons.displayName = "ActionButtons";

export const ExpandedSection = styled({
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid var(--fo-palette-divider)",
});
ExpandedSection.displayName = "ExpandedSection";

// ─── Thumbnails ─────────────────────────────────────────────────────

export const thumbnailStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 4,
  objectFit: "cover",
};

export const ThumbnailPlaceholder = styled({
  width: 36,
  height: 36,
  borderRadius: 4,
  background: "var(--fo-palette-background-level2)",
});
ThumbnailPlaceholder.displayName = "ThumbnailPlaceholder";

// ─── NoBrainKeys Empty State ────────────────────────────────────────

export const NoBrainKeysContainer = styled({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  padding: "0 40px",
});
NoBrainKeysContainer.displayName = "NoBrainKeysContainer";

export const NoBrainKeysCard = styled({
  width: "100%",
  borderRadius: 8,
  background: "var(--fo-palette-background-level2)",
  border: "1px solid var(--fo-palette-divider)",
  overflow: "hidden",
});
NoBrainKeysCard.displayName = "NoBrainKeysCard";

export const NoBrainKeysHeader = styled({
  display: "flex",
  gap: 12,
  padding: 16,
  alignItems: "center",
});
NoBrainKeysHeader.displayName = "NoBrainKeysHeader";

export const NoBrainKeysIconBox = styled({
  width: 44,
  height: 44,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "var(--fo-palette-background-level3)",
});
NoBrainKeysIconBox.displayName = "NoBrainKeysIconBox";

export const NoBrainKeysHeaderText = styled({
  display: "flex",
  flexDirection: "column",
  gap: 2,
});
NoBrainKeysHeaderText.displayName = "NoBrainKeysHeaderText";

export const NoBrainKeysSection = styled({
  padding: 16,
});
NoBrainKeysSection.displayName = "NoBrainKeysSection";

export const codeBlockStyle: CSSProperties = {
  borderRadius: 6,
  padding: 12,
  fontFamily: "monospace",
  fontSize: 12,
  lineHeight: "20px",
  background: "var(--fo-palette-background-level3)",
  color: "var(--fo-palette-text-secondary)",
  margin: 0,
  whiteSpace: "pre",
};

export const NoBrainKeysActions = styled({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: 16,
});
NoBrainKeysActions.displayName = "NoBrainKeysActions";

export const NoBrainKeysCta = styled({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "20px 16px",
});
NoBrainKeysCta.displayName = "NoBrainKeysCta";

// ─── NewSearch ──────────────────────────────────────────────────────

export const NewSearchContainer = styled({
  padding: 16,
});
NewSearchContainer.displayName = "NewSearchContainer";

export const InfoCard = styled({
  borderRadius: 6,
  padding: 12,
  background: "var(--fo-palette-background-level2)",
  border: "1px solid var(--fo-palette-divider)",
});
InfoCard.displayName = "InfoCard";

export const SubmitRow = styled({
  display: "flex",
  justifyContent: "flex-end",
});
SubmitRow.displayName = "SubmitRow";

const querySelectorBoxBase: CSSProperties = {
  borderRadius: 6,
  padding: 12,
  background: "var(--fo-palette-background-level2)",
};

export const QuerySelectorBoxActive = styled({
  ...querySelectorBoxBase,
  border: "1px solid var(--fo-palette-primary-main)",
});
QuerySelectorBoxActive.displayName = "QuerySelectorBoxActive";

export const QuerySelectorBoxInactive = styled({
  ...querySelectorBoxBase,
  border: "1px solid var(--fo-palette-divider)",
});
QuerySelectorBoxInactive.displayName = "QuerySelectorBoxInactive";

// ─── FilterBar ──────────────────────────────────────────────────────

export const FilterBarSearchCol = styled({
  flex: 1,
});
FilterBarSearchCol.displayName = "FilterBarSearchCol";

export const FilterBarDateCol = styled({
  minWidth: "10rem",
});
FilterBarDateCol.displayName = "FilterBarDateCol";

// ─── BulkActionBar ──────────────────────────────────────────────────

export const BulkActionBarContainer = styled({
  position: "sticky",
  bottom: 0,
  left: 0,
  right: 0,
  padding: "12px 16px",
  zIndex: 10,
  background: "var(--fo-palette-background-level2)",
  borderTop: "1px solid var(--fo-palette-divider)",
});
BulkActionBarContainer.displayName = "BulkActionBarContainer";

// ─── Tooltip ────────────────────────────────────────────────────────

export const tooltipTextStyle: CSSProperties = {
  color: "var(--color-content-text-primary)",
};
