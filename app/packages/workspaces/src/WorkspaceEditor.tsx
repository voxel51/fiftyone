/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The create/edit dialog for a workspace: name, description, color, and the
 * save/delete actions. A portaled, centered card — the lighter body tier
 * with level3 fields, like the saved-views dialog.
 */

import { AnchoredListbox, useAnchorRect } from "@fiftyone/components";
import { executeOperator } from "@fiftyone/operators";
import { constants, sessionSpaces } from "@fiftyone/state";
import {
  Button,
  Card,
  CardBackground,
  Clickable,
  Heading,
  HeadingLevel,
  Icon,
  IconName,
  Input,
  Size,
  Text,
  TextArea,
  TextColor,
  TextVariant,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilCallback, useRecoilState, useResetRecoilState } from "recoil";
import { ColorDot } from "./Workspaces";
import {
  DELETE_WORKSPACE_OPERATOR,
  LOAD_WORKSPACE_OPERATOR,
  SAVE_WORKSPACE_OPERATOR,
} from "./constants";
import { useWorkspaces } from "./hooks";
import { workspaceEditorStateAtom } from "./state";

const { COLOR_OPTIONS } = constants;

/** The editor's color picker: the popout family, one row per color. */
const ColorSelect: React.FC<{
  selected: { label: string; color: string | null } | null;
  onSelect: (color: string) => void;
}> = ({ selected, onSelect }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(triggerRef, open);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest?.('[data-cy="workspaces-color-popout"]')) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={triggerRef} style={{ width: "100%" }}>
      <Clickable
        role="button"
        tabIndex={0}
        aria-label="Workspace color"
        data-cy="workspaces-color-trigger"
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
          height: 32,
          padding: "0 10px",
          boxSizing: "border-box",
          background: "var(--fo-palette-background-level3)",
          border: "1px solid var(--fo-palette-primary-plainBorder)",
          borderRadius: 4,
        }}
      >
        <ColorDot color={selected?.color} />
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {selected?.label ?? "Color"}
        </Text>
        <span style={{ marginLeft: "auto", display: "inline-flex" }}>
          <Icon
            name={open ? IconName.ChevronTop : IconName.ChevronBottom}
            size={Size.Sm}
          />
        </span>
      </Clickable>
      <AnchoredListbox
        rect={rect}
        zIndex={10010}
        data-cy="workspaces-color-popout"
        options={COLOR_OPTIONS.map((option) => option.label)}
        activeIndex={COLOR_OPTIONS.findIndex(
          (option) => option.color === selected?.color,
        )}
        onPick={(label) => {
          const option = COLOR_OPTIONS.find((o) => o.label === label);
          if (option?.color) onSelect(option.color);
          setOpen(false);
        }}
        onHighlight={() => undefined}
        optionId={(i) => `workspaces-color-${i}`}
        optionAriaLabel={(label) => label}
        isSelected={(label) => label === selected?.label}
        maxHeight={Math.min(280, window.innerHeight - (rect?.top ?? 0) - 12)}
        renderOption={(label) => {
          const option = COLOR_OPTIONS.find((o) => o.label === label);
          return (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <ColorDot color={option?.color} />
              {label}
            </span>
          );
        }}
      />
    </div>
  );
};

export default function WorkspaceEditor() {
  const { reset } = useWorkspaces();
  const [state, setState] = useRecoilState(workspaceEditorStateAtom);
  const resetEditor = useResetRecoilState(workspaceEditorStateAtom);
  const { open, name, description, color, edit } = state;
  const getSessionSpaces = useRecoilCallback(({ snapshot }) => async () => {
    return snapshot.getPromise(sessionSpaces);
  });
  const colorObject = useMemo(
    () => COLOR_OPTIONS.find((c) => c.color === color) ?? null,
    [color],
  );
  const [status, setStatus] = useState("");

  const handleClose = useCallback(resetEditor, [resetEditor]);

  const isSaving = status === "saving";
  const isDeleting = status === "deleting";

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        data-cy="workspaces-editor"
        // The stage editor popover's surface, centered — every floating
        // editor in the app family wears the same card
        style={{
          width: 500,
          maxWidth: "90vw",
          pointerEvents: "auto",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          borderRadius: 6,
        }}
      >
        <Card
          background={CardBackground.Primary}
          outlined
          compact
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Heading level={HeadingLevel.H3}>Workspace Editor</Heading>
            <Clickable
              role="button"
              tabIndex={0}
              aria-label="close"
              data-cy="workspaces-btn-close"
              onClick={handleClose}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClose();
                }
              }}
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              <Icon name={IconName.Close} size={Size.Sm} />
            </Clickable>
          </div>

          <div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Name
            </Text>
            <Input
              data-cy="workspaces-input-name"
              autoFocus
              placeholder="Your workspace name"
              value={name}
              onChange={(e) =>
                setState((current) => ({ ...current, name: e.target.value }))
              }
            />
          </div>

          <div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Description
            </Text>
            <TextArea
              data-cy="workspaces-input-description"
              rows={5}
              placeholder="Enter a description"
              value={description}
              onChange={(e) =>
                setState((current) => ({
                  ...current,
                  description: e.target.value,
                }))
              }
            />
          </div>

          <div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Color
            </Text>
            <ColorSelect
              selected={colorObject}
              onSelect={(picked) =>
                setState((current) => ({ ...current, color: picked }))
              }
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
            }}
          >
            <span>
              {edit && (
                <Button
                  variant={Variant.Secondary}
                  size={Size.Sm}
                  data-cy="workspaces-btn-delete"
                  leadingIcon={IconName.Delete}
                  disabled={isDeleting}
                  onClick={() => {
                    setStatus("deleting");
                    executeOperator(
                      DELETE_WORKSPACE_OPERATOR,
                      { names: [name] },
                      {
                        callback: (result) => {
                          if (!result.error) {
                            reset();
                            handleClose();
                            setStatus("");
                          }
                        },
                        skipOutput: true,
                      },
                    );
                  }}
                >
                  Delete
                </Button>
              )}
            </span>
            <span style={{ display: "inline-flex", gap: 12 }}>
              <Button
                variant={Variant.Secondary}
                size={Size.Sm}
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                data-cy="workspaces-btn-save"
                disabled={isSaving || !name}
                onClick={async () => {
                  setStatus("saving");
                  executeOperator(
                    SAVE_WORKSPACE_OPERATOR,
                    {
                      ...state,
                      current_name: edit ? state.old_name : undefined,
                      spaces: await getSessionSpaces(),
                    },
                    {
                      callback: (result) => {
                        if (!result.error) {
                          reset();
                          handleClose();
                          setStatus("");
                          executeOperator(
                            LOAD_WORKSPACE_OPERATOR,
                            { name: state.name },
                            { skipOutput: true },
                          );
                        }
                      },
                      skipOutput: true,
                    },
                  );
                }}
              >
                Save
              </Button>
            </span>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
