/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The workspaces control (the selector at the right, under the view bar): a
 * trigger showing the loaded workspace (colored dot + name), opening a
 * popout with a search box, the matching workspaces, and a pinned "Save
 * current spaces as a workspace" row. The popout wears the level3 surface
 * of the app's dropdown family.
 */

import { useAnchorRect } from "@fiftyone/components";
import { canEditWorkspaces, sessionSpaces } from "@fiftyone/state";
import {
  Clickable,
  Icon,
  IconName,
  Input,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue, useSetRecoilState } from "recoil";
import WorkspaceEditor from "./WorkspaceEditor";
import { UNSAVED_WORKSPACE_COLOR } from "./constants";
import { useWorkspaces } from "./hooks";
import { workspaceEditorStateAtom } from "./state";
import type { Workspace } from "./state";

/** A workspace's color swatch — a plain colored circle. */
export const ColorDot: React.FC<{ color?: string | null }> = ({ color }) => (
  <span
    data-cy="workspaces-color-dot"
    style={{
      display: "inline-block",
      width: 10,
      height: 10,
      borderRadius: 5,
      flexShrink: 0,
      background: color ?? UNSAVED_WORKSPACE_COLOR,
    }}
  />
);

/** The shared popout surface (the app dropdown family's look). */
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

export default function Workspaces() {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const {
    workspaces,
    loadWorkspace,
    initialized,
    listWorkspace,
    canInitialize,
  } = useWorkspaces();
  const setWorkspaceEditorState = useSetRecoilState(workspaceEditorStateAtom);
  const canEditWorkSpace = useRecoilValue(canEditWorkspaces);
  const disabled = canEditWorkSpace.enabled !== true;
  const disabledMsg = canEditWorkSpace.message;
  const sessionSpacesState = useRecoilValue(sessionSpaces);
  const currentWorkspaceName = sessionSpacesState._name;

  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(triggerRef, open);

  const currentWorkspace = useMemo(
    () => workspaces.find((space) => space.name === currentWorkspaceName),
    [workspaces, currentWorkspaceName],
  );

  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter((space) =>
        space.name.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [workspaces, searchTerm],
  );

  useEffect(() => {
    if (!initialized && canInitialize) {
      listWorkspace();
    }
  }, [open, initialized, listWorkspace, canInitialize]);

  // Click-out closes; the popout is portaled, so it is not a DOM child
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest?.('[data-cy="workspaces-popout"]')) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!canInitialize) return null;

  return (
    <div
      ref={triggerRef}
      data-cy="workspaces-container"
      style={{
        position: "absolute",
        right: 5,
        top: 6,
        zIndex: 1,
      }}
    >
      <Clickable
        role="button"
        tabIndex={0}
        aria-label="Workspaces"
        data-cy="workspaces-trigger"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((current) => !current);
          }
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 10px",
          color: "var(--fo-palette-text-secondary)",
        }}
      >
        {!initialized ? (
          <Spinner size={Size.Sm} />
        ) : (
          <>
            <ColorDot color={currentWorkspace?.color} />
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {currentWorkspace?.name || "Unsaved"}
            </Text>
          </>
        )}
        <Icon name={IconName.Workspaces} size={Size.Sm} />
      </Clickable>

      {open &&
        rect &&
        createPortal(
          <div
            data-cy="workspaces-popout"
            role="listbox"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: rect.top + 4,
              // Right-aligned under the trigger, like the control it opens
              // from sits at the right edge
              left: Math.max(8, rect.left + rect.width - 300),
              width: 300,
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
              style={{
                padding: 6,
                borderBottom: "1px solid var(--fo-palette-primary-plainBorder)",
              }}
            >
              <Input
                size={Size.Sm}
                autoFocus
                data-cy="workspaces-search-input"
                placeholder="Search workspaces.."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredWorkspaces.map((space) => (
                <WorkspaceRow
                  key={space.name}
                  workspace={space}
                  canEdit={!disabled}
                  disabledMsg={disabledMsg}
                  onPick={() => {
                    setOpen(false);
                    loadWorkspace(space.name);
                  }}
                  onEdit={() => {
                    setOpen(false);
                    setWorkspaceEditorState((state) => ({
                      ...state,
                      open: true,
                      edit: true,
                      old_name: space.name,
                      name: space.name,
                      description: space.description,
                      color: space.color,
                    }));
                  }}
                />
              ))}
            </div>
            <div
              role="button"
              tabIndex={0}
              data-cy="workspaces-create-new"
              aria-disabled={disabled}
              title={disabled ? disabledMsg : undefined}
              onClick={() => {
                if (disabled) return;
                setOpen(false);
                setWorkspaceEditorState((state) => ({
                  ...state,
                  name: searchTerm,
                  open: true,
                }));
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(false);
                  setWorkspaceEditorState((state) => ({
                    ...state,
                    name: searchTerm,
                    open: true,
                  }));
                }
              }}
              style={{
                ...ROW_STYLE,
                borderTop: "1px solid var(--fo-palette-primary-plainBorder)",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              <Icon name={IconName.Add} size={Size.Sm} />
              <Text
                variant={TextVariant.Sm}
                color={disabled ? TextColor.Tertiary : TextColor.Primary}
              >
                Save current spaces as a workspace
              </Text>
            </div>
          </div>,
          document.body,
        )}
      <WorkspaceEditor />
    </div>
  );
}

const WorkspaceRow: React.FC<{
  workspace: Workspace;
  canEdit: boolean;
  disabledMsg?: string;
  onPick: () => void;
  onEdit: () => void;
}> = ({ workspace, canEdit, disabledMsg, onPick, onEdit }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      role="option"
      aria-selected={false}
      aria-label={workspace.name}
      data-cy={`workspaces-option-${workspace.name}`}
      title={workspace.description}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onPick();
      }}
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...ROW_STYLE,
        borderBottom: "1px solid var(--fo-palette-primary-plainBorder)",
        background: hovered ? "var(--fo-palette-background-level2)" : undefined,
      }}
    >
      <ColorDot color={workspace.color} />
      <Text
        variant={TextVariant.Sm}
        color={TextColor.Primary}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {workspace.name}
      </Text>
      {canEdit && hovered && (
        <Clickable
          role="button"
          tabIndex={0}
          aria-label="Edit workspace"
          data-cy="workspaces-btn-edit"
          title={disabledMsg}
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
