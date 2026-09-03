/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One stage in the bar: a compact pill showing what it does, and the popover
 * that edits it.
 */

import {
  Align,
  Anchor,
  Button,
  Card,
  CardBackground,
  Clickable,
  IconName,
  Orientation,
  Popover,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import type { Kind, Operator } from "./builder/catalog";
import { ParamInput } from "./controls";
import {
  blockedBy,
  expressionScope,
  isEmptyValue,
  isPrivate,
  pickInput,
  rows,
} from "./params";
import type { InputKind, ParamDef, StageDefinition } from "./params";
import type { WorkingStage } from "./state";
import panelStyles from "./panel.module.css";
import styles from "./StageCard.module.css";

/**
 * A pill sits inside the bar's gutter with a hair of it showing above and
 * below, so the gutter reads as the thing the stages live in rather than a
 * border drawn around them — derived from the gutter's own height so there is
 * one number to change.
 */
const PILL_INSET = 4;

/**
 * The height of the view bar's gutter, and of anything that must line up with
 * it. Nested pieces derive their height from this rather than carrying their
 * own number.
 */
export const CHROME_CONTROL_HEIGHT = 40;

export const PILL_HEIGHT = CHROME_CONTROL_HEIGHT - PILL_INSET * 2;

interface StageCardProps {
  stage: WorkingStage;
  definition: StageDefinition;
  /** Every field path in the dataset, for scoping an expression to a field. */
  allPaths: readonly string[];
  fieldOptions: { id: string; data: { label: string } }[];
  /** The field paths a param accepts, narrowed by the constraints it declares. */
  allowedFor: (param: ParamDef) => string[];
  /** The values a closed-choice param picks from, resolved from the dataset. */
  choicesFor?: (param: ParamDef) => string[];
  /** The served operator catalog, for expression suggestions. */
  operators?: Operator[];
  /** Resolves a full field path to the kind of value it holds. */
  fieldKind?: (path: string) => Kind | undefined;
  /** The editor switcher, for controls that lay it out themselves. */
  tabs?: React.ReactNode;
  /** Why each of this stage's params was rejected, by param name. */
  errors: ReadonlyMap<string, string>;
  /** The stage cannot be applied as it stands. */
  invalid: boolean;
  /** The control in force for each param, by param name. */
  kinds: ReadonlyMap<string, InputKind>;
  onModeChange: (param: string, kind: InputKind) => void;
  expanded: boolean;
  onToggle: () => void;
  onChange: (name: string, value: unknown) => void;
  onRemove: () => void;
  /** The stage is done being described; close it and move on. */
  onCommit: () => void;
}

/**
 * Render a kwarg value as a short preview string for the collapsed
 * stage card. Keeps strings under ~24 chars; lists show the first item
 * with a `+N` tail; numbers/booleans show as-is.
 */
const previewValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const head = String(value[0] ?? "");
    return value.length > 1 ? `${head} +${value.length - 1}` : head;
  }
  const s = String(value);
  return s.length > 24 ? `${s.slice(0, 21)}…` : s;
};

export const StageCard: React.FC<StageCardProps> = ({
  stage,
  definition,
  fieldOptions,
  allPaths,
  invalid,
  allowedFor,
  choicesFor,
  operators,
  fieldKind,
  errors,
  kinds,
  onModeChange,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onCommit,
}) => {
  const firstParam = definition.params[0];
  const editButtonRef = React.useRef<HTMLSpanElement | null>(null);
  const popoverContentRef = React.useRef<HTMLDivElement | null>(null);

  // A stage still missing required values cannot be finished with Enter, and
  // wears the same red outline a rejected value does
  const incomplete = definition.params.some(
    (param) =>
      !isPrivate(param) &&
      param.required &&
      isEmptyValue(stage.kwargs[param.name]),
  );

  // The stage was just added or just clicked; either way the next thing the
  // user wants is to type into it. The popover portals its panel, which
  // mounts a render after `expanded` flips, so an effect keyed on `expanded`
  // runs before the content exists. The panel's ref callback is the one
  // moment the content is guaranteed to be in the DOM.
  const focusEditor = React.useCallback((el: HTMLDivElement | null) => {
    popoverContentRef.current = el;
    if (!el) return;

    // Not a combobox: voodo's Select opens its options on focus, and opening
    // a dropdown nobody asked for is not what starting the keyboard means
    const typeable = el.querySelector<HTMLElement>(
      "input:not([disabled]):not([role='combobox']), textarea:not([disabled])",
    );

    // Otherwise the panel itself takes focus, so Tab reaches the first
    // control in one keystroke and Escape and Enter already work. The panel
    // is positioned a moment later; focusing must not scroll to where it is
    // now.
    (typeable ?? el).focus({ preventScroll: true });
  }, []);

  const pill = (
    <Card
      background={CardBackground.Primary}
      outlined
      compact
      className={[
        styles.pill,
        // A stage that cannot be applied says so once its editor closes —
        // while the popover is open the user is mid-thought, not in error
        !expanded && (invalid || incomplete) ? styles.pillInvalid : null,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height: PILL_HEIGHT }}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        align={Align.Center}
      >
        {/* Always-visible compact preview: name + first-arg value.
              Click opens the editing popover below. */}
        <Tooltip
          portal
          anchor={Anchor.Bottom}
          content={expanded ? "Close editor" : "Edit stage"}
        >
          {/* voodo's Clickable takes no ref, so the wrapper carries the one
              Escape refocuses through */}
          <span ref={editButtonRef} className={styles.trigger}>
            <Clickable
              onClick={onToggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={expanded ? "Close editor" : "Edit stage"}
            >
              <Stack
                orientation={Orientation.Row}
                spacing={Spacing.Xs}
                align={Align.Center}
              >
                <Text variant={TextVariant.Md} className={styles.name}>
                  {definition.name}
                </Text>
                {firstParam && (
                  <Text
                    variant={TextVariant.Sm}
                    color={TextColor.Secondary}
                    className={styles.preview}
                  >
                    {previewValue(stage.kwargs[firstParam.name])}
                  </Text>
                )}
              </Stack>
            </Clickable>
          </span>
        </Tooltip>

        {/* The stage's full story lives in its API docs — a quiet link on
              the pill itself, out of the popover's way */}
        <Tooltip
          portal
          anchor={Anchor.Bottom}
          content={`${definition.name} API documentation`}
        >
          <Button
            href={`https://docs.voxel51.com/api/fiftyone.core.stages.html#fiftyone.core.stages.${definition.name}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`${definition.name} API documentation`}
            onClick={(e) => e.stopPropagation()}
            variant={Variant.Icon}
            size={Size.Sm}
            borderless
            leadingIcon={IconName.ExternalLink}
          />
        </Tooltip>

        <Tooltip portal anchor={Anchor.Bottom} content="Remove stage">
          <Button
            onClick={onRemove}
            aria-label="Remove stage"
            variant={Variant.Icon}
            size={Size.Sm}
            borderless
            leadingIcon={IconName.Close}
          />
        </Tooltip>
      </Stack>
    </Card>
  );

  // The editor: a controlled popover anchored to the pill. The bar decides
  // when it opens (a click on the pill, or the stage having just been added)
  // and the popover reports Escape and outside clicks back through
  // onOpenChange. It wears the same card surface as the pill, so it reads as
  // a continuation of the clicked pill rather than a separate overlay.
  return (
    <Popover
      data-cy="view-stage-container"
      trigger={pill}
      open={expanded}
      onOpenChange={(open) => {
        if (!open && expanded) onToggle();
      }}
      // One width for every stage: sizing to content made the popover jump
      // as the editor changed and gave two stages holding the same parameter
      // two different shapes
      panelClassName={panelStyles.panel}
      // Focus is placed by the panel's ref callback — on the first typeable
      // control, not the panel
      focusOnOpen={false}
    >
      <div
        ref={focusEditor}
        tabIndex={-1}
        data-cy="view-stage-editor"
        onKeyDown={(e) => {
          // Escape closes the editor and puts the keyboard back on the
          // pill, so the next Escape reaches the bar
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
            requestAnimationFrame(() =>
              editButtonRef.current
                ?.querySelector<HTMLElement>('[role="button"]')
                ?.focus(),
            );
            return;
          }

          // Enter finishes the stage, which applies it and puts the keyboard
          // on the next insert slot. The code editor keeps its newlines, and
          // a stage still missing a required value is not finished.
          if (e.key !== "Enter" || e.shiftKey || incomplete) return;
          if ((e.target as Element).closest?.(".monaco-editor")) return;

          e.preventDefault();
          onCommit();
        }}
      >
        {/* Each control names itself — text inputs through their
                  placeholder, toggles through their label — so there is no
                  label column and no gutter beside the narrow controls. */}
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          {rows(
            definition.params.filter((p) => !isPrivate(p)),
            (p) => kinds.get(p.name) ?? pickInput(p),
          ).map((row) => (
            <Stack
              key={row.map((p) => p.name).join(",")}
              orientation={
                row.length > 1 ? Orientation.Row : Orientation.Column
              }
              spacing={Spacing.Md}
              className={row.length > 1 ? styles.wrapRow : undefined}
            >
              {row.map((p) => {
                const blockedOn = blockedBy(p, definition.params, stage.kwargs);
                return (
                  <ParamInput
                    key={p.name}
                    param={p}
                    value={stage.kwargs[p.name]}
                    error={errors.get(p.name)}
                    disabled={blockedOn !== null}
                    blockedOn={blockedOn}
                    kind={kinds.get(p.name) ?? pickInput(p)}
                    onModeChange={(kind) => onModeChange(p.name, kind)}
                    onChange={(v) => onChange(p.name, v)}
                    fieldOptions={fieldOptions}
                    allowedFor={allowedFor}
                    choicesFor={choicesFor}
                    operators={operators}
                    fieldKind={fieldKind}
                    scope={expressionScope(p, definition.params, stage.kwargs)}
                    allPaths={allPaths}
                    lowered={stage.lowered[p.name]}
                    onCommit={() => {
                      if (!incomplete) onCommit();
                    }}
                    testId={`view-stage-param-${p.name}`}
                  />
                );
              })}
            </Stack>
          ))}
        </Stack>
      </div>
    </Popover>
  );
};
