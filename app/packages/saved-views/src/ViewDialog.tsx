/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The create/edit dialog for a saved view: name, description, color, and the
 * save/delete actions. A portaled, centered card on the family's popout
 * surface — no MUI. data-cy names mirror the legacy dialog exactly.
 */

import { AnchoredListbox, useAnchorRect } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { toSlug } from "@fiftyone/utilities";
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
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { ColorDot } from "./SavedViewSelector";
import { viewDialogContent, viewDialogOpen } from "./state";

const {
  COLOR_OPTIONS,
  COLOR_OPTIONS_MAP,
  DEFAULT_COLOR,
  DEFAULT_COLOR_OPTION,
} = fos.constants;

interface Props {
  /** data-cy prefix; the POM knows this dialog as `saved-views`. */
  id: string;
  savedViews: fos.State.SavedView[];
  onEditSuccess: (savedView: fos.State.SavedView, reload?: boolean) => void;
  onDeleteSuccess: (name: string) => void;
  canEdit?: boolean;
  /** Creating requires something to save. */
  hasViewContent: boolean;
}

/** The dialog's color picker: the same popout family, one row per color. */
const ColorSelect: React.FC<{
  id: string;
  selected: { id: string; label: string; color: string | null };
  onSelect: (option: {
    id: string;
    label: string;
    color: string | null;
  }) => void;
}> = ({ id, selected, onSelect }) => {
  const [open, setOpen] = useState(false);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(triggerRef, open);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (triggerRef.current?.contains(target)) return;
      if (target.closest?.(`[data-cy="${id}-selection-view"]`)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, id]);

  return (
    <div ref={triggerRef} style={{ width: "100%" }}>
      <Clickable
        role="button"
        tabIndex={0}
        aria-label="View color"
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
          height: 32,
          padding: "0 10px",
          boxSizing: "border-box",
          background: "var(--fo-palette-background-level3)",
          border: "1px solid var(--fo-palette-primary-plainBorder)",
          borderRadius: 4,
        }}
      >
        <ColorDot color={selected.color} />
        <Text variant={TextVariant.Sm} color={TextColor.Primary}>
          {selected.label}
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
        data-cy={`${id}-selection-view`}
        options={COLOR_OPTIONS.map((option) => option.label)}
        activeIndex={COLOR_OPTIONS.findIndex(
          (option) => option.id === selected.id,
        )}
        onPick={(label) => {
          const option = COLOR_OPTIONS.find((o) => o.label === label);
          if (option) onSelect(option);
          setOpen(false);
        }}
        onHighlight={() => undefined}
        optionId={(i) => `${id}-color-${i}`}
        optionAriaLabel={(label) => label}
        isSelected={(label) => label === selected.label}
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

/** Test-only export: the color select in isolation. */
export const COLOR_SELECT_TEST_EXPORT = ColorSelect;

export default function ViewDialog({
  id,
  savedViews,
  onEditSuccess,
  onDeleteSuccess,
  canEdit,
  hasViewContent,
}: Props) {
  const [isOpen, setIsOpen] = useRecoilState(viewDialogOpen);
  const viewContent = useRecoilValue(viewDialogContent);
  const resetViewContent = useResetRecoilState(viewDialogContent);
  const {
    name: initialName,
    description: initialDescription,
    color: initialColor,
    isCreating,
  } = viewContent;

  const [nameValue, setNameValue] = useState(initialName);
  const [descriptionValue, setDescriptionValue] = useState(initialDescription);
  const [colorOption, setColorOption] = useState(
    () => COLOR_OPTIONS_MAP[initialColor] || DEFAULT_COLOR_OPTION,
  );

  useEffect(() => {
    if (viewContent.name) {
      setNameValue(viewContent.name);
      setDescriptionValue(viewContent.description);
      setColorOption(
        COLOR_OPTIONS_MAP[viewContent.color] || DEFAULT_COLOR_OPTION,
      );
    }
  }, [viewContent]);

  const savedViewSlugs = new Set(
    savedViews.map((view) => view.slug.toLowerCase()),
  );
  const slugValue = toSlug(nameValue);
  const nameExists =
    Boolean(nameValue) &&
    nameValue !== initialName &&
    slugValue.length > 0 &&
    savedViewSlugs.has(slugValue);
  const nameError = nameExists ? "Name already exists" : "";

  const view = useRecoilValue(fos.view);
  const {
    handleDeleteView,
    isDeletingSavedView,
    handleCreateSavedView,
    isCreatingSavedView,
    handleUpdateSavedView,
    isUpdatingSavedView,
  } = fos.useSavedViews();

  const resetValues = useCallback(() => {
    resetViewContent();
    setNameValue("");
    setDescriptionValue("");
    setColorOption(DEFAULT_COLOR_OPTION);
  }, [resetViewContent]);

  const close = useCallback(() => {
    setIsOpen(false);
    resetValues();
  }, [resetValues, setIsOpen]);

  const onDeleteView = useCallback(() => {
    handleDeleteView(nameValue, () => {
      resetValues();
      setIsOpen(false);
      onDeleteSuccess(nameValue);
    });
  }, [handleDeleteView, nameValue, onDeleteSuccess, resetValues, setIsOpen]);

  const onSaveView = useCallback(() => {
    const color = colorOption.color || DEFAULT_COLOR;
    if (isCreating) {
      handleCreateSavedView(
        nameValue,
        descriptionValue,
        color,
        view,
        (savedView) => {
          resetValues();
          onEditSuccess(savedView as unknown as fos.State.SavedView, true);
          setIsOpen(false);
        },
      );
    } else {
      handleUpdateSavedView(
        initialName,
        nameValue,
        descriptionValue,
        color,
        (savedView) => {
          resetValues();
          onEditSuccess(
            savedView as unknown as fos.State.SavedView,
            initialName !== nameValue,
          );
          setIsOpen(false);
        },
      );
    }
  }, [
    isCreating,
    handleCreateSavedView,
    handleUpdateSavedView,
    nameValue,
    descriptionValue,
    colorOption.color,
    view,
    resetValues,
    onEditSuccess,
    setIsOpen,
    initialName,
  ]);

  if (!isOpen) {
    return null;
  }

  const saveDisabled =
    isUpdatingSavedView ||
    isCreatingSavedView ||
    isDeletingSavedView ||
    slugValue.length < 1 ||
    Boolean(nameError) ||
    !nameValue ||
    (isCreating && !view?.length && !hasViewContent) ||
    (initialName === nameValue &&
      descriptionValue === initialDescription &&
      colorOption.color === initialColor);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
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
        data-cy={`${id}-modal-body-container`}
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
            <Heading level={HeadingLevel.H3}>
              {isCreating ? "Create view" : "Edit view"}
            </Heading>
            <Clickable
              role="button"
              tabIndex={0}
              aria-label="close"
              data-cy={`${id}-btn-close`}
              onClick={close}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  close();
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
              data-cy={`${id}-input-name`}
              autoFocus
              placeholder="Your view name"
              value={nameValue}
              error={Boolean(nameError)}
              onChange={(e) => setNameValue(e.target.value)}
            />
            {nameError && (
              <Text variant={TextVariant.Xs} color={TextColor.Destructive}>
                {nameError}
              </Text>
            )}
          </div>

          <div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Description
            </Text>
            <TextArea
              data-cy={`${id}-input-description`}
              rows={5}
              placeholder="Enter a description"
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
            />
          </div>

          <div>
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              Color
            </Text>
            <ColorSelect
              id={`${id}-input-color-selection`}
              selected={colorOption}
              onSelect={setColorOption}
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
              {!isCreating && canEdit && (
                <Button
                  variant={Variant.Secondary}
                  size={Size.Sm}
                  data-cy={`${id}-btn-delete`}
                  onClick={onDeleteView}
                  leadingIcon={IconName.Delete}
                >
                  Delete
                </Button>
              )}
            </span>
            <span style={{ display: "inline-flex", gap: 12 }}>
              <Button
                variant={Variant.Secondary}
                size={Size.Sm}
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                variant={Variant.Primary}
                size={Size.Sm}
                data-cy={`${id}-btn-save`}
                disabled={saveDisabled}
                onClick={onSaveView}
              >
                Save view
              </Button>
            </span>
          </div>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
