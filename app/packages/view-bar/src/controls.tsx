/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * One parameter's control, and the switcher for choosing between the editors it
 * accepts. Which editors those are, and which of them places the switcher
 * itself, is decided in `./params`.
 */

import { Code } from "@fiftyone/components";
import {
  Align,
  Anchor,
  Button,
  Icon,
  IconName,
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Text,
  TextColor,
  TextVariant,
  Toggle,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React from "react";

import type { Kind, Operator } from "./builder/catalog";
import { ExpressionEditor } from "./builder/ExpressionEditor";
import { isEnvelope, sourceOf } from "./builder/envelope";
import styles from "./controls.module.css";
import { scopedEntries } from "./fields";
import {
  EDITOR_HEADER_HEIGHT,
  EXPRESSION_BOX_HEIGHT,
  humanize,
  isEmptyValue,
  MODE_LABELS,
  NO_BROWSER_SUGGESTIONS,
  NO_STATUS_LINE,
  paramModes,
  PLACES_ITS_OWN_TABS,
} from "./params";
import type { InputKind, ParamDef } from "./params";

interface ParamInputProps {
  param: ParamDef;
  value: unknown;
  /** The control in force, chosen from {@link paramModes}. */
  kind: InputKind;
  /** Why this value cannot be sent, if it cannot. */
  error?: string | null;
  /** Waiting on a required parameter declared before it. */
  disabled?: boolean;
  /** The parameter it waits on, for saying so. */
  blockedOn?: string | null;
  onChange: (next: unknown) => void;
  fieldOptions: { id: string; data: { label: string } }[];
  /** The field paths a param accepts, narrowed by the constraints it declares. */
  allowedFor: (param: ParamDef) => string[];
  /** The values a closed-choice param picks from, resolved from the dataset. */
  choicesFor?: (param: ParamDef) => string[];
  /** The editor switcher, for controls that place it themselves. */
  tabs?: React.ReactNode;
  /** The field an expression on this param is evaluated against, if any. */
  scope?: string | null;
  /** Every field path in the dataset, for scoping an expression's suggestions. */
  allPaths?: readonly string[];
  /** The server's lowering of this param's expression, when it has one. */
  lowered?: unknown;
  /** The served operator catalog, for the expression editor's suggestions. */
  operators?: Operator[];
  /** Resolves a full field path to the kind of value it holds. */
  fieldKind?: (path: string) => Kind | undefined;
  /** The stage is done being described; close it and move on. */
  onCommit?: () => void;
  /** Names this parameter's control group for tests. */
  testId?: string;
}

/**
 * Names a `Select` from the inside.
 *
 * voodo's `Select` takes no placeholder, so an unset picker shows nothing at
 * all and the parameter has to be named somewhere. A label above costs a line
 * per control and reads as a form; the name belongs in the control it names.
 * Removable once `placeholder` lands on `Select` in voxel51/design-system.
 */
const PlaceheldSelect: React.FC<
  React.PropsWithChildren<{ placeholder: string; empty: boolean }>
> = ({ placeholder, empty, children }) => (
  <div className={styles.selectShell}>
    {children}
    {empty && (
      <Text
        variant={TextVariant.Caption}
        color={TextColor.Placeholder}
        className={styles.selectPlaceholder}
      >
        {placeholder}
      </Text>
    )}
  </div>
);

/**
 * A list control's value. A list mode also covers the param's singular
 * alternative, so a view that carries one bare value still opens with it shown.
 */
const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value as string[];
  return typeof value === "string" && value ? [value] : [];
};

const ParamControl: React.FC<ParamInputProps> = ({
  param,
  value,
  kind,
  error,
  disabled,
  onChange,
  fieldOptions,
  allowedFor,
  choicesFor,
  tabs,
  scope,
  allPaths = [],
  lowered,
  operators,
  fieldKind,
  blockedOn,
  onCommit,
}) => {
  const invalid = Boolean(error);
  // Controls name themselves, and say they are required in the same breath —
  // a bare `*` beside the name is a second thing to look at and decode
  const allowed = allowedFor(param);
  const allowedSet = React.useMemo(() => new Set(allowed), [allowed]);
  const options = React.useMemo(
    () => fieldOptions.filter((option) => allowedSet.has(option.id)),
    [fieldOptions, allowedSet],
  );
  // A filter on a label field is applied to each label, so the expression
  // names the label's own fields rather than paths from the sample —
  // and kinds are resolved against the schema, which knows the full path
  const scoped = React.useMemo(
    () => (scope ? scopedEntries(scope, allPaths) : null),
    [scope, allPaths],
  );
  const label = humanize(param.name);
  const described = param.placeholder?.trim() || label;
  const placeholder = param.required ? `${described} (required)` : described;
  const name = placeholder;
  const blockedReason = blockedOn
    ? `Choose ${humanize(blockedOn)} first`
    : undefined;

  switch (kind) {
    case "bool":
      return (
        <Toggle
          disabled={disabled}
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
          label={humanize(param.name)}
          aria-label={param.name}
        />
      );

    case "select": {
      const values = choicesFor?.(param) ?? [];
      // A picker with nothing to pick is disabled and says so, rather than
      // opening an empty list
      const barren = values.length === 0;
      const picks = values.map((v) => ({ id: v, data: { label: v } }));
      // A list-taking param picks several — `SelectGroupSlices` takes one
      // media type or many
      if (param.tokens.some((token) => token.startsWith("list<"))) {
        return (
          <PlaceheldSelect
            placeholder={barren ? "No choices available" : name}
            empty={asList(value).length === 0}
          >
            <Select
              className={styles.select}
              portal
              disabled={disabled || barren}
              value={asList(value)}
              options={picks}
              onChange={(v) => onChange(Array.isArray(v) ? v : v ? [v] : [])}
            />
          </PlaceheldSelect>
        );
      }
      return (
        <PlaceheldSelect
          placeholder={barren ? "No choices available" : name}
          empty={typeof value !== "string"}
        >
          <Select
            className={styles.select}
            exclusive
            portal
            disabled={disabled || barren}
            value={typeof value === "string" ? value : undefined}
            options={picks}
            onChange={(v) => {
              if (typeof v === "string") onChange(v);
            }}
          />
        </PlaceheldSelect>
      );
    }

    case "field":
      return (
        <PlaceheldSelect
          placeholder={options.length ? name : "No choices available"}
          empty={typeof value !== "string"}
        >
          <Select
            className={styles.select}
            exclusive
            portal
            disabled={disabled || options.length === 0}
            value={typeof value === "string" ? value : undefined}
            options={options}
            onChange={(v) => {
              if (typeof v === "string") onChange(v);
            }}
          />
        </PlaceheldSelect>
      );

    case "fieldList":
      return (
        <PlaceheldSelect
          placeholder={options.length ? name : "No choices available"}
          empty={asList(value).length === 0}
        >
          <Select
            className={styles.select}
            portal
            disabled={disabled || options.length === 0}
            value={asList(value)}
            options={options}
            onChange={(v) => onChange(Array.isArray(v) ? v : v ? [v] : [])}
          />
        </PlaceheldSelect>
      );

    case "numeric":
      return (
        <Input
          error={invalid}
          disabled={disabled}
          size={Size.Sm}
          {...NO_BROWSER_SUGGESTIONS}
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "stringList":
      // Comma-separated entry; trimmed on parse. For multi-select
      // typeahead we'd need a known options set — strings are
      // free-form so a textual list is the simplest honest input.
      return (
        <Input
          error={invalid}
          disabled={disabled}
          size={Size.Sm}
          {...NO_BROWSER_SUGGESTIONS}
          value={asList(value).join(", ")}
          placeholder={`${placeholder} (comma separated)`}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );

    case "id":
    case "string":
      return (
        <Input
          error={invalid}
          disabled={disabled}
          size={Size.Sm}
          {...NO_BROWSER_SUGGESTIONS}
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "idList":
      return (
        <Input
          error={invalid}
          disabled={disabled}
          size={Size.Sm}
          {...NO_BROWSER_SUGGESTIONS}
          value={asList(value).join(", ")}
          placeholder={`${placeholder} (id, id, …)`}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );

    case "python": {
      const source = sourceOf(value);
      const suggestable = scoped ? [...scoped.keys()] : allowed;
      const kindAt = scoped
        ? (path: string) => fieldKind?.(scoped.get(path) ?? path)
        : fieldKind;
      return (
        <ExpressionEditor
          disabled={disabled}
          disabledReason={blockedReason}
          onSubmit={onCommit}
          tabs={tabs}
          // Named from inside the input, beside the example it is asking for —
          // a label above would be a whole line to say one word
          placeholder={`${placeholder} — F("label") == "cat"`}
          value={source ?? ""}
          error={error ?? undefined}
          fields={suggestable}
          fieldKind={kindAt}
          operators={operators}
          onChange={onChange}
        />
      );
    }

    case "json":
    default: {
      // An expression's json view is the lowering the server sent for it;
      // before a first apply there is nothing true to show
      const shownJson = isEnvelope(value)
        ? lowered !== undefined
          ? JSON.stringify(lowered, null, 2)
          : ""
        : value == null
          ? ""
          : typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2);

      // A real editor, not a one-line input: these values are nested documents,
      // and bracket matching and syntax colouring are what make them editable
      return (
        <Stack
          orientation={Orientation.Column}
          spacing={Spacing.Xs}
          className={disabled ? styles.disabledCursor : undefined}
        >
          {/*
            The same header the expression editor has: switcher and status on
            one line, the box below carrying the outline. A single-mode data
            param has no header — an empty line here read as a gap between the
            box and the control above it. The condition is stable while
            typing: hanging it on `invalid` would bounce the box on every
            half-typed brace, so a headerless param reports through its border
            and the Apply tooltip instead.
          */}
          {(Boolean(tabs) ||
            Boolean(disabled && blockedReason) ||
            param.tokens.includes("expr")) && (
            <Stack
              orientation={Orientation.Row}
              spacing={Spacing.Sm}
              align={Align.Center}
              style={{ height: EDITOR_HEADER_HEIGHT }}
            >
              {tabs}
              {disabled && blockedReason ? (
                // The same lock the expression editor's header shows, so the
                // two tabs say the same thing the same way
                <Stack
                  orientation={Orientation.Row}
                  spacing={Spacing.Xs}
                  align={Align.Center}
                >
                  <Icon
                    name={IconName.Lock}
                    size={Size.Sm}
                    color={TextColor.Muted}
                  />
                  <Text
                    variant={TextVariant.Caption}
                    color={TextColor.Muted}
                    className={styles.truncate}
                  >
                    {blockedReason}
                  </Text>
                </Stack>
              ) : (
                invalid && (
                  // Every flex wrapper between the row and the nowrap text
                  // must be allowed to shrink, or the ellipsis never engages
                  // and the message runs out of the popover
                  <Tooltip
                    portal
                    content={error ?? ""}
                    wrapperClassName={styles.shrinkable}
                  >
                    <Text
                      variant={TextVariant.Caption}
                      color={TextColor.Destructive}
                      className={styles.truncateBlock}
                    >
                      {error}
                    </Text>
                  </Tooltip>
                )
              )}
              {/* The json here is a lowered ViewExpression, so the corner links
                the format's docs — unless the param is plain data, which has
                no format to document beyond the stage's own docs already on
                the pill */}
              {param.tokens.includes("expr") && (
                <Tooltip
                  portal
                  anchor={Anchor.Bottom}
                  content="View expression documentation"
                >
                  <Button
                    href="https://docs.voxel51.com/api/fiftyone.core.expressions.html#fiftyone.core.expressions.ViewExpression"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View expression documentation"
                    variant={Variant.Icon}
                    size={Size.Sm}
                    borderless
                    leadingIcon={IconName.ExternalLink}
                    className={styles.docsLink}
                  />
                </Tooltip>
              )}
            </Stack>
          )}
          {/*
            Monaco lays itself out against a definite box. Its parent is the
            popover's fixed width, so 100% is a real number here — and it keeps
            watching, because the box changes when the editor is swapped in
          */}
          <div
            className={[
              styles.editorBox,
              invalid ? styles.editorBoxInvalid : null,
              disabled ? styles.editorBoxDisabled : null,
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ height: EXPRESSION_BOX_HEIGHT }}
          >
            <Code
              height="100%"
              width="100%"
              defaultLanguage="json"
              value={shownJson}
              onChange={(next) => onChange(next ?? "")}
              options={{
                readOnly: disabled,
                // What typing into the locked editor pops up — without it,
                // Monaco's stock "cannot edit" tooltip appears clipped by the
                // popover, an unexplained sliver
                readOnlyMessage: blockedReason
                  ? { value: blockedReason }
                  : undefined,
                automaticLayout: true,
                minimap: { enabled: false },
                lineNumbers: "off",
                folding: false,
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineHeight: 18,
                wordWrap: "on",
                renderLineHighlight: "none",
                overviewRulerLanes: 0,
                padding: { top: 6, bottom: 6 },
                scrollbar: {
                  vertical: "auto",
                  horizontal: "hidden",
                  verticalScrollbarSize: 8,
                },
              }}
            />
            {!shownJson.trim() && !disabled && (
              <Text
                variant={TextVariant.Caption}
                color={TextColor.Placeholder}
                className={styles.editorPlaceholder}
              >
                {/* An expression param shows an operator example; a dict a
                    mapping one. Other data params (a list of values, a
                    pipeline) share no example worth lying with, so the
                    parameter names itself alone. */}
                {param.tokens.includes("expr")
                  ? `${placeholder} — {"$gt": ["$confidence", 0.5]}`
                  : param.tokens.includes("dict")
                    ? `${placeholder} — {"cat": "dog"}`
                    : placeholder}
              </Text>
            )}
          </div>
        </Stack>
      );
    }
  }
};

/**
 * A parameter's control, the editors it can be entered with, and the reason its
 * value was rejected. voodo's `Input` takes only a boolean error, so for most
 * controls the message is rendered here.
 */
export const ParamInput: React.FC<
  ParamInputProps & { onModeChange: (kind: InputKind) => void }
> = ({ onModeChange, ...props }) => {
  const modes = paramModes(props.param);

  const tabs = modes.length > 1 && (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.None}
      role="tablist"
      className={styles.tabs}
    >
      {modes.map((mode) => {
        // An expression cannot be recovered from lowered MongoDB, so the
        // editor that would show it is refused rather than shown empty
        const unavailable =
          mode === "python" &&
          !isEmptyValue(props.value) &&
          sourceOf(props.value) === null;

        // One Button variant for every state: the active tab holds the same
        // pill the hover state draws, so nothing changes shape — mixing
        // variants gave hover a pill and active an outline
        const tab = (
          <Button
            key={mode}
            size={Size.Xs}
            variant={Variant.Borderless}
            role="tab"
            aria-selected={mode === props.kind}
            disabled={unavailable}
            onClick={unavailable ? undefined : () => onModeChange(mode)}
            className={mode === props.kind ? styles.activeTab : undefined}
          >
            {MODE_LABELS[mode]}
          </Button>
        );

        return unavailable ? (
          <Tooltip
            portal
            key={mode}
            content="This filter was not written as an expression, so it can only be edited as JSON"
          >
            {tab}
          </Tooltip>
        ) : (
          tab
        );
      })}
    </Stack>
  );

  const status = !NO_STATUS_LINE.has(props.kind) && (
    <Text
      variant={TextVariant.Caption}
      color={TextColor.Destructive}
      className={styles.status}
    >
      {props.error ?? " "}
    </Text>
  );

  // A control with a tall region places the switcher itself, against its own
  // content, so that content keeps the full width of the popover rather than
  // starting past the tabs
  if (PLACES_ITS_OWN_TABS.has(props.kind)) {
    return (
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.None}
        data-cy={props.testId}
      >
        <ParamControl {...props} tabs={tabs} />
        {status}
      </Stack>
    );
  }

  return (
    // Everything else keeps the switcher to the left of the control it governs
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Sm}
      align={Align.Start}
      data-cy={props.testId}
    >
      {/* Rendered only when there are tabs: an empty slot still costs the
          row's flex gap, leaving single-mode controls a gap thinner than
          their peers. */}
      {tabs ? <div className={styles.tabsSlot}>{tabs}</div> : null}
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.None}
        className={styles.control}
      >
        <ParamControl {...props} />
        {status}
      </Stack>
    </Stack>
  );
};
