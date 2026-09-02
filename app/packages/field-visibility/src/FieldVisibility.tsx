/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The field visibility dialog: choose the fields shown in the sidebar by
 * selection or by filter rule, then apply an ExcludeFields stage. A portaled,
 * centered card on the stage-editor surface, like the saved-views and
 * workspaces dialogs.
 *
 * data-cy names mirror the legacy Schema components exactly — the e2e
 * field-visibility POM addresses this dialog by them.
 */

import { ExternalLink } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  Align,
  Button,
  Card,
  CardBackground,
  Clickable,
  Heading,
  HeadingLevel,
  Icon,
  IconName,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  Text,
  TextVariant,
  ToggleSwitch,
  ToggleSwitchVariant,
  Variant,
} from "@voxel51/voodo";
import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useResetRecoilState } from "recoil";
import { SchemaSearch } from "./SchemaSearch";
import { SchemaSelection } from "./SchemaSelection";

const FIELD_VISIBILITY_DOCUMENTATION_LINK =
  "https://docs.voxel51.com/user_guide/app.html#app-field-visibility";
const EXCLUDE_FIELDS_STAGE = "fiftyone.core.stages.ExcludeFields";

export default function FieldVisibility() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    settingModal,
    setSettingsModal,
    searchTerm,
    setSearchTerm,
    setSelectedTab,
    selectedTab,
    resetExcludedPaths,
    isFilterRuleActive,
    setShowNestedFields,
    mergedSchema,
    excludedPathsStripped,
    resetAttributeFilters,
  } = fos.useSchemaSettings();
  const { searchResults, setSearchResults } =
    fos.useSearchSchemaFields(mergedSchema);

  const applyDisabled =
    isFilterRuleActive && (!searchTerm || !searchResults.length);
  const resetDisabled = isFilterRuleActive && !searchResults.length;

  const { setFieldVisibilityStage } = fos.useSetSelectedFieldsStage();
  const resetFieldVisibilityStage = useResetRecoilState(
    fos.fieldVisibilityStage,
  );

  const close = useCallback(() => {
    setSearchTerm("");
    setSearchResults([]);
    setSettingsModal({ open: false });
  }, [setSearchTerm, setSearchResults, setSettingsModal]);

  const { open: isSettingsModalOpen } = settingModal || {};
  if (!isSettingsModalOpen) {
    return null;
  }

  const tabIndex = Math.max(fos.TAB_OPTIONS.indexOf(selectedTab), 0);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        const active = document.activeElement as HTMLInputElement | null;
        if (active?.tagName === "INPUT" && active.type === "text") return;
        if (e.key === "Escape") close();
      }}
      onMouseDown={(e) => {
        if (!containerRef.current?.contains(e.target as Node)) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--fo-palette-neutral-softBg)",
      }}
    >
      <div
        ref={containerRef}
        data-cy="field-visibility-container"
        // The stage editor popover's surface, centered — every floating
        // editor in the app family wears the same card
        style={{
          width: 750,
          maxWidth: "90vw",
          maxHeight: "80vh",
          display: "flex",
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
          borderRadius: 6,
        }}
      >
        <Card
          background={CardBackground.Primary}
          outlined
          compact
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%",
            minHeight: 0,
          }}
        >
          <Stack
            orientation={Orientation.Row}
            align={Align.Center}
            justify={Justify.Between}
          >
            <Heading level={HeadingLevel.H3}>Field visibility</Heading>
            <Stack
              orientation={Orientation.Row}
              align={Align.Center}
              spacing={Spacing.Sm}
            >
              <ExternalLink
                title="Documentation"
                href={FIELD_VISIBILITY_DOCUMENTATION_LINK}
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                <Icon name={IconName.ExternalLink} size={Size.Sm} />
              </ExternalLink>
              <Clickable
                role="button"
                tabIndex={0}
                aria-label="close"
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
            </Stack>
          </Stack>

          <ToggleSwitch
            variant={ToggleSwitchVariant.Soft}
            index={tabIndex}
            onChange={(index: number) => {
              setSelectedTab(fos.TAB_OPTIONS[index]);
              setShowNestedFields(false);
            }}
            tabs={fos.TAB_OPTIONS.map((value) => ({
              id: value,
              data: {
                // The e2e POM finds tabs by this title
                label: (
                  <Text variant={TextVariant.Md} title={`Field ${value}`}>
                    {value}
                  </Text>
                ),
                content: null,
              },
            }))}
          />

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {isFilterRuleActive ? (
              <SchemaSearch
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
              />
            ) : (
              <SchemaSelection />
            )}
          </div>

          <Stack orientation={Orientation.Row} justify={Justify.Between}>
            <Button
              variant={Variant.Secondary}
              size={Size.Sm}
              data-cy="field-visibility-btn-reset"
              disabled={resetDisabled}
              onClick={() => {
                setSettingsModal({ open: false });
                setSearchTerm("");
                resetFieldVisibilityStage();
                resetExcludedPaths();
                setSearchResults([]);
                resetAttributeFilters();
              }}
            >
              Reset
            </Button>
            <Button
              variant={Variant.Primary}
              size={Size.Sm}
              data-cy="field-visibility-btn-apply"
              disabled={applyDisabled}
              onClick={() => {
                resetAttributeFilters();
                setSettingsModal({ open: false });
                setFieldVisibilityStage({
                  cls: EXCLUDE_FIELDS_STAGE,
                  kwargs: {
                    field_names: excludedPathsStripped,
                  },
                });
              }}
            >
              Apply
            </Button>
          </Stack>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
