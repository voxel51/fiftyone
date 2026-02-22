import { CSSProperties } from "react";

// ─── Shared / Reusable ──────────────────────────────────────────────

export const fullCenter: CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const fullSize: CSSProperties = {
  width: "100%",
  height: "100%",
};

export const flexColumn: CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

export const flexRow: CSSProperties = {
  display: "flex",
  flexDirection: "row",
};

export const divider: CSSProperties = {
  borderTop: "1px solid var(--fo-palette-divider)",
};

// ─── RunList ────────────────────────────────────────────────────────

export const runListContainer: CSSProperties = {
  padding: 16,
  height: "100%",
  display: "flex",
  flexDirection: "column",
};

export const selectAllRow: CSSProperties = {
  marginBottom: 8,
};

export const emptyState: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  gap: 8,
};

export const runsList: CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

export const runCard: CSSProperties = {
  borderRadius: 6,
  padding: 12,
  border: "1px solid var(--fo-palette-text-secondary)",
  background: "var(--fo-palette-background-level1)",
};

export const checkboxCell: CSSProperties = {
  display: "flex",
  alignItems: "center",
  marginRight: 8,
  paddingTop: 2,
};

export const actionButtons: CSSProperties = {
  display: "flex",
};

export const expandButton: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

export const expandedSection: CSSProperties = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid var(--fo-palette-divider)",
};

// ─── Thumbnails ─────────────────────────────────────────────────────

export const thumbnail: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 4,
  objectFit: "cover",
};

export const thumbnailPlaceholder: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 4,
  background: "var(--fo-palette-background-level2)",
};

// ─── NoBrainKeys Empty State ────────────────────────────────────────

export const noBrainKeysContainer: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  flex: 1,
  padding: "0 40px",
};

export const noBrainKeysCard: CSSProperties = {
  width: "100%",
  borderRadius: 8,
  background: "var(--fo-palette-background-level2)",
  border: "1px solid var(--fo-palette-divider)",
  overflow: "hidden",
};

export const noBrainKeysHeader: CSSProperties = {
  display: "flex",
  gap: 12,
  padding: 16,
  alignItems: "center",
};

export const noBrainKeysIconBox: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  background: "var(--fo-palette-background-level3)",
};

export const noBrainKeysHeaderText: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

export const noBrainKeysSection: CSSProperties = {
  padding: 16,
};

export const codeBlock: CSSProperties = {
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

export const noBrainKeysActions: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: 16,
};

export const noBrainKeysCta: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "20px 16px",
};

// ─── NewSearch ──────────────────────────────────────────────────────

export const newSearchContainer: CSSProperties = {
  padding: 16,
};

export const noBrainKeysWarning: CSSProperties = {
  borderRadius: 6,
  padding: 12,
  background: "var(--fo-palette-background-level2)",
  border: "1px solid var(--fo-palette-divider)",
};

export const submitRow: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

export const querySelectorBox: CSSProperties = {
  borderRadius: 6,
  padding: 12,
  background: "var(--fo-palette-background-level2)",
};

export const querySelectorBoxActive: CSSProperties = {
  ...querySelectorBox,
  border: "1px solid var(--fo-palette-primary-main)",
};

export const querySelectorBoxInactive: CSSProperties = {
  ...querySelectorBox,
  border: "1px solid var(--fo-palette-divider)",
};

// ─── FilterBar ──────────────────────────────────────────────────────

export const filterBarSearchCol: CSSProperties = {
  flex: 1,
};

export const filterBarDateCol: CSSProperties = {
  minWidth: "10rem",
};

// ─── BulkActionBar ──────────────────────────────────────────────────

export const bulkActionBar: CSSProperties = {
  position: "sticky",
  bottom: 0,
  left: 0,
  right: 0,
  padding: "12px 16px",
  zIndex: 10,
  background: "var(--fo-palette-background-level2)",
  borderTop: "1px solid var(--fo-palette-divider)",
};
