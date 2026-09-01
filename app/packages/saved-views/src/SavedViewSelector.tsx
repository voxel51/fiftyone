/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The saved-views control: a trigger showing the selected view (colored dot
 * + name), opening a popout with a search box, the matching views, and a
 * pinned "Save current filters as view" row. The popout wears the same
 * level3 surface every dropdown in the app family wears.
 *
 * data-cy names mirror the legacy `Selection` component exactly — the e2e
 * saved-views POM addresses this control by them.
 */

import { useAnchorRect } from "@fiftyone/components";
import type { DatasetViewOption } from "@fiftyone/state";
import { DEFAULT_SELECTED } from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Input,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Anchor,
} from "@voxel51/voodo";
import React from "react";
import { createPortal } from "react-dom";

/** A view's color swatch — a plain colored circle; no widget exists for it. */
export const ColorDot: React.FC<{ color?: string | null }> = ({ color }) => (
  <span
    data-cy="selection-color-dot"
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: 5,
      flexShrink: 0,
      background: color ?? "var(--fo-palette-text-tertiary)",
    }}
  />
);

/** The shared popout surface (the family look every bar dropdown wears). */
export const POPOUT_SURFACE: React.CSSProperties = {
  background: "var(--fo-palette-background-level3)",
  border: "1px solid var(--fo-palette-primary-plainBorder)",
  borderRadius: 4,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
};

const ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  cursor: "pointer",
  minWidth: 0,
};

export interface SavedViewSelectorProps {
  /** data-cy prefix; the POM knows this control as `saved-views`. */
  id: string;
  items: DatasetViewOption[];
  selected: DatasetViewOption | null;
  onSelect: (item: DatasetViewOption) => void;
  onClear: () => void;
  onEdit: (item: DatasetViewOption) => void;
  /** Opens the create-view dialog from the pinned last row. */
  onCreate: () => void;
  search: { value: string; onSearch: (term: string) => void };
  /** The viewer may not create or edit saved views. */
  disabled: boolean;
  /** Tooltip explaining `disabled`. */
  disabledMsg?: string;
  /** There is nothing to save — the create row stays inert. */
  isEmptyView: boolean;
}

export const SavedViewSelector: React.FC<SavedViewSelectorProps> = ({
  id,
  items,
  selected,
  onSelect,
  onClear,
  onEdit,
  onCreate,
  search,
  disabled,
  disabledMsg,
  isEmptyView,
}) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(containerRef, open);

  // Click-out closes; the popout is portaled, so it is not a DOM child
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (containerRef.current?.contains(target)) return;
      if (target.closest?.(`[data-cy="${id}-selection-view"]`)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, id]);

  const createDisabled = isEmptyView || disabled;
  const hasSelection = Boolean(selected && selected.id !== DEFAULT_SELECTED.id);
  const label = selected?.label ?? "Unsaved view";

  return (
    <div
      ref={containerRef}
      data-cy={`${id}-selection-container`}
      style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}
    >
      {/* The trigger: the selected view's dot + name */}
      <Clickable
        role="button"
        tabIndex={0}
        aria-label={label}
        data-cy={`${id}-selection`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((current) => !current);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          minWidth: 0,
          height: 32,
          padding: "0 10px",
          boxSizing: "border-box",
          background: "var(--fo-palette-background-level1)",
          border: "1px solid var(--fo-palette-primary-plainBorder)",
          borderRadius: 4,
        }}
      >
        {hasSelection && <ColorDot color={selected?.color} />}
        <Text
          variant={TextVariant.Sm}
          color={hasSelection ? TextColor.Primary : TextColor.Secondary}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </Text>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
          {hasSelection && (
            <Clickable
              role="button"
              tabIndex={0}
              aria-label="Clear view"
              data-cy={`${id}-btn-selection-clear`}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onClear();
                }
              }}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <Icon name={IconName.Close} size={Size.Sm} />
            </Clickable>
          )}
          <Icon
            name={open ? IconName.ChevronTop : IconName.ChevronBottom}
            size={Size.Sm}
          />
        </span>
      </Clickable>

      {open &&
        rect &&
        createPortal(
          <div
            data-cy={`${id}-selection-view`}
            role="listbox"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: rect.top + 4,
              left: rect.left,
              width: rect.width,
              zIndex: 10000,
              maxHeight: 380,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              color: "var(--fo-palette-text-primary)",
              ...POPOUT_SURFACE,
            }}
          >
            <div
              data-cy={`${id}-selection-search-container`}
              style={{
                padding: 6,
                borderBottom: "1px solid var(--fo-palette-primary-plainBorder)",
              }}
            >
              <Input
                size={Size.Sm}
                autoFocus
                data-cy={`${id}-selection-search-input`}
                placeholder="Search views..."
                value={search.value}
                onChange={(e) => search.onSearch(e.target.value)}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {items.map((item) => (
                <OptionRow
                  key={item.id}
                  id={id}
                  item={item}
                  active={selected?.id === item.id}
                  canEdit={!disabled}
                  onPick={() => {
                    setOpen(false);
                    onSelect(item);
                  }}
                  onEdit={() => {
                    setOpen(false);
                    onEdit(item);
                  }}
                />
              ))}
            </div>
            <Tooltip
              anchor={Anchor.Top}
              content={createDisabled ? (disabledMsg ?? "Nothing to save") : ""}
            >
              <div
                role="button"
                tabIndex={0}
                data-cy="saved-views-create-new"
                aria-disabled={createDisabled}
                onClick={() => {
                  if (createDisabled) return;
                  setOpen(false);
                  onCreate();
                }}
                onKeyDown={(e) => {
                  if (createDisabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(false);
                    onCreate();
                  }
                }}
                style={{
                  ...ROW_STYLE,
                  borderTop: "1px solid var(--fo-palette-primary-plainBorder)",
                  cursor: createDisabled ? "not-allowed" : "pointer",
                  color: createDisabled
                    ? "var(--fo-palette-text-tertiary)"
                    : "var(--fo-palette-text-primary)",
                }}
              >
                <Icon name={IconName.Add} size={Size.Sm} />
                <Text
                  variant={TextVariant.Sm}
                  color={
                    createDisabled ? TextColor.Tertiary : TextColor.Primary
                  }
                >
                  Save current filters as view
                </Text>
              </div>
            </Tooltip>
          </div>,
          document.body,
        )}
    </div>
  );
};

const OptionRow: React.FC<{
  id: string;
  item: DatasetViewOption;
  active: boolean;
  canEdit: boolean;
  onPick: () => void;
  onEdit: () => void;
}> = ({ id, item, active, canEdit, onPick, onEdit }) => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      role="option"
      aria-selected={active}
      aria-label={item.label}
      data-cy={`${id}-${item.slug || "new"}-selection-option`}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPick();
      }}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...ROW_STYLE,
        background: active
          ? "var(--fo-palette-background-level2)"
          : hovered
            ? "var(--fo-palette-background-level2)"
            : undefined,
      }}
    >
      <ColorDot color={item.color} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <Text
          variant={TextVariant.Sm}
          color={TextColor.Primary}
          style={{
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.label}
        </Text>
        {item.description && (
          <Text
            variant={TextVariant.Xs}
            color={TextColor.Secondary}
            style={{
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.description}
          </Text>
        )}
      </span>
      {canEdit && hovered && (
        <Clickable
          role="button"
          tabIndex={0}
          aria-label="Edit view"
          data-cy="btn-edit-selection"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }
          }}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <Icon name={IconName.Edit} size={Size.Sm} />
        </Clickable>
      )}
    </div>
  );
};
