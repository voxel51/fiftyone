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
  Anchor,
  Button,
  Icon,
  IconName,
  Input,
  Orientation,
  Size,
  Spacing,
  Stack,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useReducer } from "react";

import { kindsByFtype, operatorsFrom } from "./builder/catalog";
import { fromSource, isEnvelope, sourceOf } from "./builder/envelope";
import { allowedFields } from "./fields";
import {
  appliesTo,
  defaultKwargs,
  inferMode,
  isEmptyValue,
  NO_BROWSER_SUGGESTIONS,
  isPrivate,
  pickInput,
  validateParam,
} from "./params";
import type { InputKind, ParamDef, StageDefinition } from "./params";
import { StageCard, useAnchorRect } from "./StageCard";
import {
  initialState,
  makeId,
  NO_ERRORS,
  NO_KINDS,
  reducer,
  viewFingerprint,
  workingStagesFromView,
} from "./state";
import type { SerializedStage } from "./state";
import type { WorkingStage } from "./state";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";

// ---------------------------------------------------------------
// Param type → input kind resolver
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Bar-level state
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Dynamic form for a single stage's params
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Stage card
// ---------------------------------------------------------------

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

/** Every slice qualifies — a slice-picking param is not media-type fussy. */
const ALL_SLICE_MEDIA_TYPES: fos.GroupSliceMediaType[] = [
  "image",
  "video",
  "3d",
  "multimodal",
];

const ViewBar: React.FC = () => {
  const stageDefs = useRecoilValue(fos.stageDefinitions);
  const fieldPaths = useRecoilValue(fos.fieldPaths({}));
  const fieldTypes = fos.useFieldTypes();
  const mediaType = fos.useDatasetMediaType();
  const currentView = useRecoilValue(fos.view);
  const setView = fos.useSetView();

  const [state, dispatch] = useReducer(reducer, initialState);
  // Which stage's editor popover is open, by stage id. Only one at
  // a time; clicking another collapses the previous.
  const [editingId, setEditingId] = React.useState<string | null>(null);
  // Modes the user chose explicitly, keyed `${stageId}:${paramName}`. Absent
  // means the mode is inferred from the value, so a hydrated stage opens in the
  // editor matching what is already there.
  const [modeOverrides, setModeOverrides] = React.useState<
    Record<string, InputKind>
  >({});
  // Params the user has entered something into, keyed `${stageId}:${paramName}`.
  // A required param is empty until it is filled, so reporting that as an error
  // straight away would open every freshly added stage already marked invalid.
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const applyRef = React.useRef<HTMLDivElement | null>(null);

  /**
   * Puts the keyboard on Apply. Deferred a frame because the button only
   * renders once the working state diverges — it may not exist until the
   * change that wants it focused has painted.
   */
  const focusApply = useCallback(() => {
    requestAnimationFrame(() => {
      applyRef.current?.querySelector("button")?.focus();
    });
  }, []);

  /**
   * Finishing a stage closes it and puts the keyboard on Apply, so the same key
   * that finished the stage runs the view — no reaching for the mouse between
   * describing a view and seeing it.
   */
  const commitStage = useCallback(() => {
    setEditingId(null);
    focusApply();
  }, [focusApply]);

  const markTouched = useCallback((stageId: string, param: string) => {
    setTouched((current) => {
      const key = `${stageId}:${param}`;
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  }, []);

  // Stage definitions provide the param schema; the view itself
  // carries kwargs as an ordered `kwargs: [[name, value], ...]` list.
  const serializeWorkingRef = React.useRef<() => SerializedStage[]>(() => []);

  useEffect(() => {
    const hydrate = () => {
      //
      // After Apply the server echoes the view back — the same stages, with
      // expressions lowered into `kwargs` and their syntax beside them.
      // Rebuilding from an echo would close the editor the user just opened
      // and discard anything mid-edit, so an arriving view that means what
      // the bar already holds is left alone.
      //
      if (
        viewFingerprint(currentView) ===
        viewFingerprint(serializeWorkingRef.current())
      ) {
        return;
      }

      const hydrated = workingStagesFromView(currentView);
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
    () => new Map(stageDefs.map((d) => [d.name, d as StageDefinition])),
    [stageDefs],
  );

  const fieldPathSet = useMemo(() => new Set(fieldPaths), [fieldPaths]);

  const fieldOptions = useMemo(
    () =>
      fieldPaths.map((path) => ({
        id: path,
        data: { label: path },
      })),
    [fieldPaths],
  );

  /**
   * The fields a param accepts. Each stage declares its own constraints — a
   * label field, a frame-level one, a `GeoLocation` — so a picker that offered
   * every path would be offering values the stage rejects.
   */
  const allowedFor = useCallback(
    (param: ParamDef) =>
      allowedFields(fieldPaths, param.choices.fields, fieldTypes),
    [fieldPaths, fieldTypes],
  );

  // The expression editor suggests from the served catalog — null until the
  // query resolves, which reads as "suggest nothing rather than something
  // wrong". Field kinds resolve through the schema: path → ftype → kind.
  const catalog = fos.useExpressionCatalog();
  const operators = useMemo(
    () => operatorsFrom(catalog?.viewExpressionOperators ?? []),
    [catalog],
  );
  const kindByFtype = useMemo(
    () => kindsByFtype(catalog?.viewExpressionFieldKinds ?? []),
    [catalog],
  );
  const fieldKind = useCallback(
    (path: string) => {
      const field = fieldTypes.get(path);
      return field ? kindByFtype.get(field.ftype) : undefined;
    },
    [fieldTypes, kindByFtype],
  );

  // Closed-choice params pick from a list: the stage's own constants, or
  // names only the dataset knows — its group slices, its evaluation keys
  const evaluationKeys = fos.useEvaluationKeys();
  const groupSlices = fos.useGroupSlices(ALL_SLICE_MEDIA_TYPES);
  const choicesFor = useCallback(
    (param: ParamDef): string[] => {
      switch (param.choices.source) {
        case "GROUP_SLICES":
          return groupSlices;
        case "EVALUATION_KEYS":
          return evaluationKeys;
        default:
          return [...param.choices.values];
      }
    },
    [groupSlices, evaluationKeys],
  );

  /**
   * The mode in force for each param, by stage id then param name: the user's
   * explicit choice when there is one, otherwise inferred from the value.
   */
  const activeKinds = useMemo(() => {
    const byStage = new Map<string, Map<string, InputKind>>();
    for (const stage of state.stages) {
      const def = defsByName.get(stage.cls);
      const kinds = new Map<string, InputKind>();
      for (const param of def?.params ?? []) {
        const override = modeOverrides[`${stage.id}:${param.name}`];
        kinds.set(
          param.name,
          override ??
            inferMode(param, stage.kwargs[param.name], (path) =>
              fieldPathSet.has(path),
            ),
        );
      }
      byStage.set(stage.id, kinds);
    }
    return byStage;
  }, [state.stages, defsByName, modeOverrides, fieldPathSet]);

  const kindOf = useCallback(
    (stage: WorkingStage, param: ParamDef): InputKind =>
      activeKinds.get(stage.id)?.get(param.name) ?? pickInput(param),
    [activeKinds],
  );

  /**
   * Switching mode clears the value unless it means the same thing in the
   * editor being switched to: a field path is not an expression, and
   * reinterpreting one as the other would silently change what gets applied.
   *
   * The one crossing that survives is an envelope opened as Python, since that
   * is the syntax it was built from. Going the other way does not — the App
   * cannot lower an expression to MongoDB, only the server can.
   */
  const changeMode = useCallback(
    (stage: WorkingStage, param: string, kind: InputKind) => {
      setModeOverrides((current) => ({
        ...current,
        [`${stage.id}:${param}`]: kind,
      }));

      const value = stage.kwargs[param];

      // An expression is one value with two representations, and flipping
      // between its editors must not destroy it. Source text is parsed into
      // the envelope on the way to the json editor, which shows the lowering
      // the server sent for it — or nothing yet, never a fabrication.
      if (kind === "python" && sourceOf(value) !== null) return;
      if (kind === "json") {
        if (isEnvelope(value)) return;
        if (typeof value === "string" && value.trim()) {
          const parsed = fromSource(value);
          if (parsed.status === "ok") {
            dispatch({
              type: "setKwarg",
              id: stage.id,
              name: param,
              value: parsed.envelope,
            });
            return;
          }
        }
      }

      if (!isEmptyValue(value)) {
        dispatch({ type: "setKwarg", id: stage.id, name: param, value: "" });
      }
    },
    [],
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
          const kind = kindOf(s, p);
          // Numeric controls hold what was typed; validation has already
          // rejected anything that is not a number by the time Apply runs
          if (kind === "numeric" && typeof value === "string") {
            return [p.name, Number(value.trim())];
          }
          // The Python editor holds source; the server takes the envelope it
          // parses to, and decodes that back into the expression it describes
          if (kind === "python" && typeof value === "string") {
            const result = fromSource(value);
            return [p.name, result.status === "ok" ? result.envelope : value];
          }
          return [p.name, value];
        });
      return { _cls: `fiftyone.core.stages.${s.cls}`, kwargs };
    });
  }, [state.stages, defsByName, kindOf]);

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
      // A hidden parameter cannot be fixed, so it must never block Apply
      for (const param of (def?.params ?? []).filter((p) => !isPrivate(p))) {
        const message = validateParam(
          param,
          stage.kwargs[param.name],
          kindOf(stage, param),
        );
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
  }, [state.stages, defsByName, kindOf]);

  /**
   * The errors to show. Apply is gated on all of them, but a param the user has
   * not entered anything into has no input to be wrong about yet — the reason it
   * blocks Apply is on the button's own tooltip.
   */
  const visibleErrors = useMemo(() => {
    const byStage = new Map<string, ReadonlyMap<string, string>>();
    for (const [stageId, messages] of paramErrors.byStage) {
      const shown = new Map(
        [...messages].filter(([param]) => touched.has(`${stageId}:${param}`)),
      );
      if (shown.size) byStage.set(stageId, shown);
    }
    return byStage;
  }, [paramErrors, touched]);

  const apply = useCallback(() => {
    if (paramErrors.labels.length) return;
    const serialized = serializeWorking();
    setView(serialized);
    // Rebuild the bar from exactly what was sent, so an applied expression
    // reopens printed from its envelope — `F("x")` as typed becomes the
    // canonical `F('x')` — without waiting on any echo from the server
    dispatch({ type: "hydrate", stages: workingStagesFromView(serialized) });
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
  serializeWorkingRef.current = serializeWorking;

  //
  // Leaving the bar closes the editor but keeps the draft — a half-described
  // stage the user clicked away from is work in progress, not a mistake to
  // undo. Its card stays in the bar with an outline saying what it needs.
  // Clicks inside the bar, the editing popover, or a picker's portaled options
  // are all still "working"; everything else is leaving.
  //
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const element = target instanceof Element ? target : null;

      if (!target.isConnected) return;
      if (element?.closest("[data-cy='view-bar']")) return;
      if (element?.closest("[data-cy='view-stage-editor']")) return;
      if (element?.closest("[data-headlessui-portal]")) return;

      setEditingId(null);
    };

    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const hasPendingChanges = useMemo(
    () => viewFingerprint(serializeWorking()) !== viewFingerprint(currentView),
    [serializeWorking, currentView],
  );

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
      // A stage the dataset cannot take is not a choice, it is a later error
      const names = stageDefs
        .filter((d) => appliesTo(d, mediaType))
        .map((d) => d.name);

      if (!q) return names;
      return names.filter((n) => n.toLowerCase().includes(q));
    }, [query, mediaType]);

    const active = Math.min(highlight, Math.max(0, filtered.length - 1));

    const insert = (cls: string) => {
      // Mint the id here so we can dispatch AND immediately set
      // the bar's `editingId` to the same id — the next render
      // will render the new stage card with its editing popover
      // already open, ready for kwargs entry.
      const id = makeId();
      dispatch({
        type: "insertStage",
        index,
        cls,
        id,
        kwargs: defaultKwargs(defsByName.get(cls)?.params ?? []),
      });
      setEditingId(id);
      setOpen(false);
      setQuery("");
    };

    if (!open) {
      return (
        <Tooltip content="Insert stage">
          <div
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen(true);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Insert stage"
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
        </Tooltip>
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
          {...NO_BROWSER_SUGGESTIONS}
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
                // What the stage does, without leaving the list — its
                // docstring's opening sentence, served with the schema
                <Tooltip
                  key={name}
                  content={defsByName.get(name)?.description ?? name}
                  anchor={Anchor.Right}
                >
                  <div
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
                </Tooltip>
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
              errors={visibleErrors.get(stage.id) ?? NO_ERRORS}
              // A stage holding a rejected value is invalid; one merely
              // missing required values is incomplete, which the card sees
              // for itself — orange says "finish me", red says "fix me"
              invalid={[
                ...(paramErrors.byStage.get(stage.id)?.values() ?? []),
              ].some((message) => message !== "Required")}
              kinds={activeKinds.get(stage.id) ?? NO_KINDS}
              onModeChange={(param, kind) => changeMode(stage, param, kind)}
              stage={stage}
              definition={def}
              fieldOptions={fieldOptions}
              allPaths={fieldPaths}
              allowedFor={allowedFor}
              choicesFor={choicesFor}
              operators={operators}
              fieldKind={fieldKind}
              expanded={editingId === stage.id}
              onToggle={() =>
                setEditingId((id) => (id === stage.id ? null : stage.id))
              }
              onChange={(name, value) => {
                markTouched(stage.id, name);
                dispatch({ type: "setKwarg", id: stage.id, name, value });
              }}
              onCommit={commitStage}
              onRemove={() => {
                if (editingId === stage.id) setEditingId(null);
                dispatch({ type: "removeStage", id: stage.id });
                // Removing a stage is an edit like any other — Enter applies it
                focusApply();
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
        ref={applyRef}
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
        <Tooltip
          content={
            paramErrors.labels.length
              ? `Fix: ${paramErrors.labels.join(", ")}`
              : "Apply view"
          }
        >
          <Button
            variant={Variant.Primary}
            size={Size.Xs}
            onClick={apply}
            disabled={paramErrors.labels.length > 0}
            data-cy="btn-apply-view-bar"
          >
            Apply
          </Button>
        </Tooltip>
      </div>
    </Stack>
  );
};

export default ViewBar;
