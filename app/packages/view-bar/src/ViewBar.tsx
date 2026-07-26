/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The dataset view bar: a horizontal row of stage cards, each with a
 * dynamic form keyed by the stage's parameter definitions, and an
 * insertion slot between every pair of stages. Local React state owns
 * the in-progress edit; the Apply button serializes the whole working
 * state and pushes it through `fos.useSetView`.
 *
 * Stage schemas come from the `stageDefinitions` atom, which mirrors
 * the server's `fiftyone/core/stages.py`. Param `type` strings are
 * pipe-delimited alternatives — see {@link pickInput} for how each
 * type token maps to a voodo input. `NoneType` in the alternative set
 * marks the field as optional.
 */

import * as fos from "@fiftyone/state";
import {
  Align,
  Button,
  Card,
  CardBackground,
  Icon,
  IconName,
  Input,
  Orientation,
  Select,
  Size,
  Spacing,
  Stack,
  Toggle,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useReducer } from "react";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";

/**
 * Anchor-rect hook for portaled dropdowns. Returns the trigger
 * element's viewport rect (top/left/width), recomputed on scroll
 * and resize so the portaled overlay tracks its anchor.
 */
const useAnchorRect = (ref: React.RefObject<HTMLElement>, active: boolean) => {
  const [rect, setRect] = React.useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  React.useEffect(() => {
    if (!active || !ref.current) {
      setRect(null);
      return undefined;
    }
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active, ref]);
  return rect;
};

// ---------------------------------------------------------------
// Param type → input kind resolver
// ---------------------------------------------------------------

/**
 * Highest-priority input "kind" for a stage parameter, derived from
 * the param's pipe-delimited `type` string. We prefer the most
 * specific UI we can offer for any alternative the param accepts —
 * `"field|str"` becomes a field picker (server still receives a
 * string), `"list<field>|field"` becomes a multi-select field
 * picker, etc.
 *
 * Order matters: pickers further down in the precedence table
 * lose to the ones above when both apply.
 */
type InputKind =
  | "bool"
  | "field"
  | "fieldList"
  | "numeric"
  | "string"
  | "stringList"
  | "json"
  | "id"
  | "idList";

export const pickInput = (typeString: string): InputKind => {
  const tokens = typeString.split("|").map((t) => t.trim());
  const has = (t: string) => tokens.includes(t);

  // Highest specificity first.
  if (has("list<field>")) return "fieldList";
  if (has("field")) return "field";
  if (has("bool")) return "bool";
  if (has("int") || has("float")) return "numeric";
  if (has("list<id>")) return "idList";
  if (has("id")) return "id";
  if (has("list<str>")) return "stringList";
  if (has("str")) return "string";
  // `json` is the catch-all — Mongo expressions, arbitrary BSON, etc.
  return "json";
};

/** `true` when a kwarg carries nothing the server should receive. */
export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

/**
 * `true` when the stage's constructor will not accept this param being
 * omitted. Verified against every stage's `__init__` signature: a param is
 * required exactly when it declares no default and does not accept `NoneType`.
 */
export const isRequired = (param: ParamDef): boolean =>
  param.default == null && !isNullable(param.type);

/**
 * The reason this value cannot be sent, or null when it can.
 *
 * Numbers are checked strictly: `Number` rejects trailing garbage where
 * `parseFloat` would quietly accept `"1x"` as 1, and a param that takes `int`
 * without `float` rejects a fractional value. Expressions and dicts are only
 * checked for being parseable — the server is the authority on their contents.
 */
export const validateParam = (
  param: ParamDef,
  value: unknown,
): string | null => {
  if (isEmptyValue(value)) {
    return isRequired(param) ? "Required" : null;
  }

  const kind = pickInput(param.type);

  if (kind === "numeric") {
    const text = String(value).trim();
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
      return `Not a number: ${text}`;
    }
    const tokens = param.type.split("|").map((t) => t.trim());
    if (!tokens.includes("float") && !Number.isInteger(parsed)) {
      return "Must be a whole number";
    }
  }

  if (kind === "json" && typeof value === "string") {
    try {
      JSON.parse(value);
    } catch (e) {
      return `Invalid JSON: ${(e as Error).message}`;
    }
  }

  return null;
};

/** `true` when the param accepts `NoneType` — i.e. is clearable. */
export const isNullable = (typeString: string): boolean =>
  typeString
    .split("|")
    .map((t) => t.trim())
    .includes("NoneType");

// ---------------------------------------------------------------
// Bar-level state
// ---------------------------------------------------------------

/** In-progress stage being composed in the bar (not yet applied). */
interface WorkingStage {
  /** Stable id for React keys + reducer addressing. */
  id: string;
  /** Stage class name, e.g. `"Match"`, `"SortBy"`. */
  cls: string;
  /** Mutable kwargs keyed by param name; values are whatever the
   *  user has typed/picked so far, not yet serialized. */
  kwargs: Record<string, unknown>;
}

interface BarState {
  stages: WorkingStage[];
}

type BarAction =
  | { type: "hydrate"; stages: WorkingStage[] }
  /** Insert a new stage at a position in the bar. `index` may be
   *  0 (head), `stages.length` (tail), or any in-between slot.
   *  Caller pre-mints `id` so it can subsequently address the new
   *  stage (e.g., to auto-open its editing popover). */
  | { type: "insertStage"; index: number; cls: string; id: string }
  | { type: "removeStage"; id: string }
  | { type: "setKwarg"; id: string; name: string; value: unknown }
  /** Reorder existing stages to match the given id ordering.
   *  Used by the RichList drag-reorder callback. */
  | { type: "reorderStages"; ids: string[] };

const initialState: BarState = { stages: [] };

const NO_ERRORS: ReadonlyMap<string, string> = new Map();

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const reducer = (state: BarState, action: BarAction): BarState => {
  switch (action.type) {
    case "hydrate":
      return { stages: action.stages };
    case "insertStage": {
      const stages = [...state.stages];
      const insertAt = Math.max(0, Math.min(action.index, stages.length));
      stages.splice(insertAt, 0, {
        id: action.id,
        cls: action.cls,
        kwargs: {},
      });
      return { stages };
    }
    case "removeStage":
      return { stages: state.stages.filter((s) => s.id !== action.id) };
    case "setKwarg":
      return {
        stages: state.stages.map((s) =>
          s.id === action.id
            ? { ...s, kwargs: { ...s.kwargs, [action.name]: action.value } }
            : s,
        ),
      };
    case "reorderStages": {
      const byId = new Map(state.stages.map((s) => [s.id, s]));
      const reordered = action.ids
        .map((id) => byId.get(id))
        .filter((s): s is WorkingStage => s !== undefined);
      return { stages: reordered };
    }
    default:
      return state;
  }
};

// ---------------------------------------------------------------
// Dynamic form for a single stage's params
// ---------------------------------------------------------------

interface ParamDef {
  name: string;
  type: string;
  default: string | null | undefined;
  placeholder: string | null | undefined;
}

interface ParamInputProps {
  param: ParamDef;
  value: unknown;
  /** Why this value cannot be sent, if it cannot. */
  error?: string | null;
  onChange: (next: unknown) => void;
  fieldOptions: { id: string; data: { label: string } }[];
}

/**
 * Names a control that cannot name itself. voodo's `Select` takes no
 * placeholder, so the field pickers get a leading label; every other control
 * carries the param name in its own placeholder.
 */
const Labelled: React.FC<
  React.PropsWithChildren<{ name: string; invalid?: boolean }>
> = ({ name, invalid, children }) => (
  <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        color: invalid
          ? "var(--fo-palette-error-plainColor)"
          : "var(--fo-palette-text-secondary)",
      }}
    >
      {name}
    </span>
    {children}
  </Stack>
);

const ParamControl: React.FC<ParamInputProps> = ({
  param,
  value,
  error,
  onChange,
  fieldOptions,
}) => {
  const invalid = Boolean(error);
  const kind = pickInput(param.type);
  // Controls name themselves, so the required marker rides along with the name
  const name = isRequired(param) ? `${param.name} *` : param.name;
  const placeholder = param.placeholder ?? name;

  switch (kind) {
    case "bool":
      return (
        <Toggle
          checked={Boolean(value)}
          onChange={(v) => onChange(v)}
          label={param.name}
          aria-label={param.name}
        />
      );

    case "field":
      return (
        <Labelled name={name} invalid={invalid}>
          <Select
            exclusive
            portal
            value={typeof value === "string" ? value : undefined}
            options={fieldOptions}
            onChange={(v) => {
              if (typeof v === "string") onChange(v);
            }}
          />
        </Labelled>
      );

    case "fieldList":
      return (
        <Labelled name={name} invalid={invalid}>
          <Select
            portal
            value={Array.isArray(value) ? (value as string[]) : []}
            options={fieldOptions}
            onChange={(v) => onChange(Array.isArray(v) ? v : v ? [v] : [])}
          />
        </Labelled>
      );

    case "numeric":
      return (
        <Input
          error={invalid}
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
          size={Size.Sm}
          value={Array.isArray(value) ? (value as string[]).join(", ") : ""}
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
          size={Size.Sm}
          value={Array.isArray(value) ? (value as string[]).join(", ") : ""}
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

    case "json":
    default:
      return (
        <Input
          error={invalid}
          size={Size.Sm}
          value={
            value == null
              ? ""
              : typeof value === "string"
                ? value
                : JSON.stringify(value)
          }
          placeholder={`${placeholder} (JSON)`}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
};

/**
 * A parameter's control plus the reason its value was rejected. voodo's `Input`
 * takes only a boolean error, so the message is rendered here.
 */
const ParamInput: React.FC<ParamInputProps> = (props) => (
  <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
    <ParamControl {...props} />
    {props.error && (
      <span
        style={{
          fontSize: 11,
          color: "var(--fo-palette-error-plainColor)",
        }}
      >
        {props.error}
      </span>
    )}
  </Stack>
);

// ---------------------------------------------------------------
// Stage card
// ---------------------------------------------------------------

interface StageCardProps {
  stage: WorkingStage;
  definition: { name: string; params: ParamDef[] };
  fieldOptions: { id: string; data: { label: string } }[];
  /** Why each of this stage's params was rejected, by param name. */
  errors: ReadonlyMap<string, string>;
  expanded: boolean;
  onToggle: () => void;
  onChange: (name: string, value: unknown) => void;
  onRemove: () => void;
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

const StageCard: React.FC<StageCardProps> = ({
  stage,
  definition,
  fieldOptions,
  errors,
  expanded,
  onToggle,
  onChange,
  onRemove,
}) => {
  const firstParam = definition.params[0];
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const popoverContentRef = React.useRef<HTMLDivElement | null>(null);
  const rect = useAnchorRect(triggerRef, expanded);

  // Outside-click closes the editing popover. Must check BOTH the
  // trigger (so re-clicking the card doesn't close-then-immediately-
  // reopen) and the portaled popover content (so interacting with
  // form fields inside doesn't close the popover).
  React.useEffect(() => {
    if (!expanded) return undefined;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        !triggerRef.current?.contains(t) &&
        !popoverContentRef.current?.contains(t)
      ) {
        onToggle();
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [expanded, onToggle]);

  return (
    <div
      ref={triggerRef}
      style={{ position: "relative" }}
      data-cy="view-stage-container"
    >
      <Card background={CardBackground.Primary} outlined compact>
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Sm}
          align={Align.Center}
        >
          {/* Always-visible compact preview: name + first-arg value.
              Click opens the editing popover below. */}
          <div
            onClick={onToggle}
            style={{ cursor: "pointer", display: "inline-flex", gap: 6 }}
            title={expanded ? "Close editor" : "Edit stage"}
          >
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {definition.name}
            </span>
            {firstParam && (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--fo-palette-text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {previewValue(stage.kwargs[firstParam.name])}
              </span>
            )}
          </div>

          <div
            onClick={onRemove}
            title="Remove stage"
            style={{ cursor: "pointer", display: "inline-flex", padding: 2 }}
          >
            <Icon name={IconName.Close} size={Size.Sm} />
          </div>
        </Stack>
      </Card>

      {/* Editing popover — portaled to document.body so it escapes
          the bar's overflow clipping. Surface matches the stage
          pill (voodo `Card.Primary` = Card1 token) so the popover
          reads as a continuation of the clicked pill, not a
          separate lighter overlay. */}
      {expanded &&
        rect &&
        createPortal(
          <div
            ref={popoverContentRef}
            style={{
              position: "fixed",
              top: rect.top + 6,
              left: rect.left,
              zIndex: 10000,
              minWidth: 260,
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
              borderRadius: 6,
            }}
          >
            <Card background={CardBackground.Primary} outlined compact>
              {/* Each control names itself — text inputs through their
                  placeholder, toggles through their label — so there is no
                  label column and no gutter beside the narrow controls. */}
              <Stack orientation={Orientation.Column} spacing={Spacing.Sm}>
                {definition.params.map((p) => (
                  <ParamInput
                    key={p.name}
                    param={p}
                    value={stage.kwargs[p.name]}
                    error={errors.get(p.name)}
                    onChange={(v) => onChange(p.name, v)}
                    fieldOptions={fieldOptions}
                  />
                ))}
              </Stack>
            </Card>
          </div>,
          document.body,
        )}
    </div>
  );
};

// ---------------------------------------------------------------
// New ViewBar
// ---------------------------------------------------------------

/**
 * Discards any working edits and restores the bar to the view that is
 * actually applied. Assigned by the mounted bar; called by the
 * `setView` setter when the mutation comes back with errors, so a
 * rejected view doesn't stay on screen as though it took effect.
 */
export let rollbackViewBar: () => void = () => undefined;

const ViewBar: React.FC = () => {
  const stageDefs = useRecoilValue(fos.stageDefinitions);
  const fieldPaths = useRecoilValue(fos.fieldPaths({}));
  const currentView = useRecoilValue(fos.view);
  const setView = fos.useSetView();

  const [state, dispatch] = useReducer(reducer, initialState);
  // Which stage's editor popover is open, by stage id. Only one at
  // a time; clicking another collapses the previous.
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Stage definitions provide the param schema; the view itself
  // carries kwargs as an ordered `kwargs: [[name, value], ...]` list.
  useEffect(() => {
    const hydrate = () => {
      const hydrated: WorkingStage[] = currentView.map(
        (s: { _cls: string; kwargs: [string, unknown][] }, i) => ({
          id: `view-${i}-${s._cls}`,
          cls: classNameFromCls(s._cls),
          kwargs: Object.fromEntries(s.kwargs ?? []),
        }),
      );
      dispatch({ type: "hydrate", stages: hydrated });
      setEditingId(null);
    };

    hydrate();
    rollbackViewBar = hydrate;
    return () => {
      rollbackViewBar = () => undefined;
    };
  }, [currentView]);

  const defsByName = useMemo(
    () =>
      new Map(
        stageDefs.map((d) => [
          d.name,
          d as { name: string; params: ParamDef[] },
        ]),
      ),
    [stageDefs],
  );

  const fieldOptions = useMemo(
    () =>
      fieldPaths.map((path) => ({
        id: path,
        data: { label: path },
      })),
    [fieldPaths],
  );

  /**
   * Re-serialize working stages, dropping kwargs the user hasn't
   * filled. Sending `null` for unfilled numeric/typed kwargs (e.g.
   * `Limit(count=None)`) crashes the server's aggregation pipeline
   * with errors like
   * `'<=' not supported between instances of 'NoneType' and 'int'`.
   * Omitting them lets the Python stage class use its own default.
   */
  const serializeWorking = useCallback(() => {
    const isEmpty = isEmptyValue;
    return state.stages.map((s) => {
      const def = defsByName.get(s.cls);
      const kwargs: [string, unknown][] = (def?.params ?? [])
        .filter((p) => !isEmpty(s.kwargs[p.name]))
        .map((p) => {
          const value = s.kwargs[p.name];
          // Numeric controls hold what was typed; validation has already
          // rejected anything that is not a number by the time Apply runs
          if (pickInput(p.type) === "numeric" && typeof value === "string") {
            return [p.name, Number(value.trim())];
          }
          return [p.name, value];
        });
      return { _cls: `fiftyone.core.stages.${s.cls}`, kwargs };
    });
  }, [state.stages, defsByName]);

  /**
   * Required params with nothing entered, keyed `${stageId}:${paramName}`.
   *
   * Serialization drops empty kwargs, so without this an unfilled required
   * param is simply omitted and the server builds a broken stage — an empty
   * `Limit` becomes `Limit()`, which raises rather than doing nothing.
   */
  const paramErrors = useMemo(() => {
    const byStage = new Map<string, Map<string, string>>();
    const labels: string[] = [];
    for (const stage of state.stages) {
      const def = defsByName.get(stage.cls);
      for (const param of def?.params ?? []) {
        const message = validateParam(param, stage.kwargs[param.name]);
        if (!message) continue;

        let messages = byStage.get(stage.id);
        if (!messages) {
          messages = new Map();
          byStage.set(stage.id, messages);
        }
        messages.set(param.name, message);
        labels.push(`${stage.cls}.${param.name} (${message})`);
      }
    }
    return { byStage, labels };
  }, [state.stages, defsByName]);

  const apply = useCallback(() => {
    if (paramErrors.labels.length) return;
    setView(serializeWorking());
  }, [paramErrors, serializeWorking, setView]);

  /**
   * Pending changes detector: whether the working state differs
   * from what's currently applied to the view. The Apply button
   * only animates in when this is true — when the user has nothing
   * to apply, the button stays hidden so the bar isn't cluttered
   * by a no-op affordance.
   *
   * Comparison is on the SERIALIZED shape (the same payload Apply
   * would push), so kwarg-order differences and dropped-empty
   * kwargs don't cause false positives.
   */
  const hasPendingChanges = useMemo(() => {
    const working = serializeWorking();
    // Strip `_uuid` from currentView entries (the view atom may
    // carry it; our working stages don't) so the comparison is
    // payload-only.
    const applied = currentView.map((s: { _cls: string; kwargs: unknown }) => ({
      _cls: s._cls,
      kwargs: s.kwargs ?? [],
    }));
    return JSON.stringify(working) !== JSON.stringify(applied);
  }, [serializeWorking, currentView]);

  /**
   * Insertion slot styled as a typeahead {@link Input} — same shape
   * as the dataset selector. The user types to filter stage names;
   * picking one inserts that stage at this slot's index and
   * auto-opens its editing popover so the kwargs form is the next
   * thing they interact with.
   *
   * Collapsed by default to a single "+" icon to keep the bar
   * compact; expands inline to a full text input on focus/click.
   */
  const InsertSlot: React.FC<{ index: number }> = ({ index }) => {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    // Highlighted stage, driven by the arrow keys. Clamped on read rather than
    // reset by an effect, so it stays valid as the filtered set changes.
    const [highlight, setHighlight] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const rect = useAnchorRect(containerRef, open);

    React.useEffect(() => {
      if (!open) return undefined;
      const onClick = (e: MouseEvent) => {
        if (!containerRef.current?.contains(e.target as Node)) {
          setOpen(false);
          setQuery("");
        }
      };
      window.addEventListener("mousedown", onClick);
      return () => window.removeEventListener("mousedown", onClick);
    }, [open]);

    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return stageDefs.map((d) => d.name);
      return stageDefs
        .map((d) => d.name)
        .filter((n) => n.toLowerCase().includes(q));
    }, [query]);

    const active = Math.min(highlight, Math.max(0, filtered.length - 1));

    const insert = (cls: string) => {
      // Mint the id here so we can dispatch AND immediately set
      // the bar's `editingId` to the same id — the next render
      // will render the new stage card with its editing popover
      // already open, ready for kwargs entry.
      const id = makeId();
      dispatch({ type: "insertStage", index, cls, id });
      setEditingId(id);
      setOpen(false);
      setQuery("");
    };

    if (!open) {
      return (
        <div
          onClick={() => setOpen(true)}
          title="Insert stage"
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 12,
            color: "var(--fo-palette-text-secondary)",
            flexShrink: 0,
          }}
        >
          <Icon name={IconName.Add} size={Size.Sm} />
        </div>
      );
    }

    return (
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: 200,
          flexShrink: 0,
          background: "var(--fo-palette-background-level2)",
          borderRadius: 4,
          border: "1px solid var(--fo-palette-text-placeholder)",
        }}
      >
        <Input
          size={Size.Sm}
          value={query}
          placeholder="Add stage…"
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            } else if (e.key === "ArrowDown") {
              // Arrow keys must not also move the text cursor
              e.preventDefault();
              setHighlight(Math.min(active + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight(Math.max(active - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              insert(filtered[active]);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-activedescendant={
            filtered[active] ? `view-bar-stage-${active}` : undefined
          }
          style={{ background: "transparent", border: "none" }}
        />
        {filtered.length > 0 &&
          rect &&
          createPortal(
            <div
              // Portaled to body — avoids being clipped by the bar's
              // overflow rules. Width follows the trigger; top sits
              // 4px below the trigger's bottom edge.
              style={{
                position: "fixed",
                top: rect.top + 4,
                left: rect.left,
                width: rect.width,
                background: "var(--fo-palette-background-level3)",
                border: "1px solid var(--fo-palette-primary-plainBorder)",
                borderRadius: 4,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
                maxHeight: 280,
                overflowY: "auto",
                zIndex: 10000,
              }}
              role="listbox"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {filtered.map((name, i) => (
                <div
                  key={name}
                  id={`view-bar-stage-${i}`}
                  role="option"
                  aria-selected={i === active}
                  ref={(el) => {
                    if (i === active) {
                      el?.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insert(name);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding: "6px 10px",
                    cursor: "pointer",
                    color: "var(--fo-palette-text-primary)",
                    whiteSpace: "nowrap",
                    background:
                      i === active
                        ? "var(--fo-palette-background-level2)"
                        : undefined,
                  }}
                >
                  {name}
                </div>
              ))}
            </div>,
            document.body,
          )}
      </div>
    );
  };

  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Xs}
      align={Align.Center}
      style={{
        width: "100%",
        height: 36,
        // No `overflow` on this container — CSS forces overflowY to
        // clip whenever any axis has `auto/hidden/scroll`, which
        // would chop the InsertSlot's dropdown of stage names.
        // Horizontal scroll for long stage chains is a follow-up
        // (likely portal the dropdown via createPortal so the
        // scroll container can clip safely).
        padding: "0 6px",
        // Darker / cooler surface than level-2 — pulls from the
        // header background token (the same dark navy the nav uses)
        // with a slightly cool overlay so the bar reads as
        // "form builder canvas" distinct from the chrome around it.
        // Border uses the primary plain border for the same cool
        // palette family as the rest of the chrome.
        background: "var(--fo-palette-background-level1)",
        border: "1px solid var(--fo-palette-primary-plainBorder)",
        borderRadius: 4,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.02)",
      }}
      data-cy="view-bar"
    >
      <InsertSlot index={0} />
      {state.stages.map((stage, i) => {
        const def = defsByName.get(stage.cls);
        if (!def) return null;
        return (
          <React.Fragment key={stage.id}>
            <StageCard
              errors={paramErrors.byStage.get(stage.id) ?? NO_ERRORS}
              stage={stage}
              definition={def}
              fieldOptions={fieldOptions}
              expanded={editingId === stage.id}
              onToggle={() =>
                setEditingId((id) => (id === stage.id ? null : stage.id))
              }
              onChange={(name, value) =>
                dispatch({ type: "setKwarg", id: stage.id, name, value })
              }
              onRemove={() => {
                if (editingId === stage.id) setEditingId(null);
                dispatch({ type: "removeStage", id: stage.id });
              }}
            />
            <InsertSlot index={i + 1} />
          </React.Fragment>
        );
      })}

      {/* Apply — only animates in when the working state diverges
          from the applied view. Always occupies the right edge via
          `marginLeft: auto` on its wrapper so other items don't
          shift sideways when Apply appears/disappears. */}
      <div
        style={{
          marginLeft: "auto",
          flexShrink: 0,
          // Animated reveal: clip + fade + slide. `width` collapses
          // to 0 when there's nothing to apply so the row stays
          // tight; `opacity` and `transform` ramp for a soft entry.
          overflow: "hidden",
          maxWidth: hasPendingChanges ? 120 : 0,
          opacity: hasPendingChanges ? 1 : 0,
          transform: hasPendingChanges ? "translateX(0)" : "translateX(8px)",
          transition:
            "max-width 200ms ease-out, opacity 200ms ease-out, transform 200ms ease-out",
          pointerEvents: hasPendingChanges ? "auto" : "none",
        }}
        aria-hidden={!hasPendingChanges}
      >
        <Button
          variant={Variant.Primary}
          size={Size.Xs}
          onClick={apply}
          disabled={paramErrors.labels.length > 0}
          title={
            paramErrors.labels.length
              ? `Fix: ${paramErrors.labels.join(", ")}`
              : "Apply view"
          }
          data-cy="btn-apply-view-bar"
        >
          Apply
        </Button>
      </div>
    </Stack>
  );
};

/**
 * Strip the `fiftyone.core.stages.` prefix off a serialized stage
 * class name to get the short name that {@link stageDefinitions}
 * keys by (e.g. `"fiftyone.core.stages.SortBy"` → `"SortBy"`).
 */
const classNameFromCls = (cls: string): string => {
  const idx = cls.lastIndexOf(".");
  return idx >= 0 ? cls.slice(idx + 1) : cls;
};

export default ViewBar;
