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
  Button,
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

import { ExpressionEditor } from "./builder/ExpressionEditor";
import { isEnvelope, sourceOf } from "./builder/envelope";
import { scopedTo } from "./fields";
import {
  humanize,
  isEmptyValue,
  MODE_LABELS,
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
  onChange: (next: unknown) => void;
  fieldOptions: { id: string; data: { label: string } }[];
  /** The field paths a param accepts, narrowed by the constraints it declares. */
  allowedFor: (param: ParamDef) => string[];
  /** The editor switcher, for controls that place it themselves. */
  tabs?: React.ReactNode;
  /** The field an expression on this param is evaluated against, if any. */
  scope?: string | null;
  /** Every field path in the dataset, for scoping an expression's suggestions. */
  allPaths?: readonly string[];
  /** The server's lowering of this param's expression, when it has one. */
  lowered?: unknown;
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
  <div style={{ position: "relative" }}>
    {children}
    {empty && (
      <Text
        variant={TextVariant.Caption}
        color={TextColor.Placeholder}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          // The click belongs to the select underneath
          pointerEvents: "none",
        }}
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
  tabs,
  scope,
  allPaths = [],
  lowered,
}) => {
  const invalid = Boolean(error);
  // Controls name themselves, and say they are required in the same breath —
  // a bare `*` beside the name is a second thing to look at and decode
  const allowed = allowedFor(param);
  const options = fieldOptions.filter((option) => allowed.includes(option.id));
  const label = humanize(param.name);
  const described = param.placeholder?.trim() || label;
  const placeholder = param.required ? `${described} (required)` : described;
  const name = placeholder;

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

    case "field":
      return (
        <PlaceheldSelect placeholder={name} empty={typeof value !== "string"}>
          <Select
            exclusive
            portal
            disabled={disabled}
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
        <PlaceheldSelect placeholder={name} empty={asList(value).length === 0}>
          <Select
            portal
            disabled={disabled}
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
      // TODO: pass a `fieldKind` resolver once `viewExpressionFieldKinds` is
      // in Relay and the field schema is reachable through a state accessor.
      // Until then every field reads as ANY, so no operator is filtered out.
      const source = sourceOf(value);
      // A filter on a label field is applied to each label, so the expression
      // names the label's own fields rather than paths from the sample
      const suggestable = scope ? scopedTo(scope, allPaths) : allowed;
      return (
        <ExpressionEditor
          disabled={disabled}
          tabs={tabs}
          // Named from inside the input, beside the example it is asking for —
          // a label above would be a whole line to say one word
          placeholder={`${placeholder} — F("label") == "cat"`}
          value={source ?? ""}
          error={error ?? undefined}
          fields={suggestable}
          onChange={onChange}
        />
      );
    }

    case "json":
    default:
      // A real editor, not a one-line input: these values are nested documents,
      // and bracket matching and syntax colouring are what make them editable
      return (
        <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
          {tabs}
          {/*
            Monaco lays itself out against a definite box. Its parent is the
            popover's fixed width, so 100% is a real number here — and it keeps
            watching, because the box changes when the editor is swapped in
          */}
          <div
            style={{
              width: "100%",
              height: JSON_EDITOR_HEIGHT,
              overflow: "hidden",
              borderRadius: 4,
              border: "1px solid var(--fo-palette-primary-plainBorder)",
            }}
          >
            <Code
              height="100%"
              width="100%"
              defaultLanguage="json"
              value={
                // An expression's json view is the lowering the server sent
                // for it; before a first apply there is nothing true to show
                isEnvelope(value)
                  ? lowered !== undefined
                    ? JSON.stringify(lowered, null, 2)
                    : ""
                  : value == null
                    ? ""
                    : typeof value === "string"
                      ? value
                      : JSON.stringify(value, null, 2)
              }
              onChange={(next) => onChange(next ?? "")}
              options={{
                readOnly: disabled,
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
          </div>
        </Stack>
      );
  }
};

/** Reserved for a rejection reason, so its arrival moves nothing. */
const STATUS_LINE_HEIGHT = 15;

/** Tall enough for a nested document without dominating the popover. */
const JSON_EDITOR_HEIGHT = 104;

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
      style={{ flexShrink: 0 }}
    >
      {modes.map((mode) => {
        // An expression cannot be recovered from lowered MongoDB, so the
        // editor that would show it is refused rather than shown empty
        const unavailable =
          mode === "python" &&
          !isEmptyValue(props.value) &&
          sourceOf(props.value) === null;

        // A segmented control: the selected editor is filled, the rest are
        // borderless, so the set reads as a choice rather than as buttons
        const tab = (
          <Button
            key={mode}
            size={Size.Xs}
            variant={
              mode === props.kind ? Variant.Secondary : Variant.Borderless
            }
            role="tab"
            aria-selected={mode === props.kind}
            disabled={unavailable}
            onClick={unavailable ? undefined : () => onModeChange(mode)}
          >
            {MODE_LABELS[mode]}
          </Button>
        );

        return unavailable ? (
          <Tooltip
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
      style={{ minHeight: STATUS_LINE_HEIGHT }}
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
      {tabs}
      <Stack
        orientation={Orientation.Column}
        spacing={Spacing.None}
        style={{ flex: 1, minWidth: 0 }}
      >
        <ParamControl {...props} />
        {status}
      </Stack>
    </Stack>
  );
};
