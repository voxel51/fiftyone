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

import { CHROME_CONTROL_HEIGHT } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import {
  Align,
  Anchor,
  Button,
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
import { InsertSlot } from "./InsertSlot";
import {
  appliesTo,
  defaultKwargs,
  gateDefinitions,
  OPEN_CAPABILITIES,
  inferMode,
  isEmptyValue,
  isPrivate,
  pickInput,
  validateParam,
} from "./params";
import type {
  InputKind,
  ParamDef,
  StageDefinition,
  ViewBarCapabilities,
} from "./params";
import { StageCard } from "./StageCard";
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

/**
 * Hides the gutter's scrollbar in every engine — `scrollbar-width` covers
 * Firefox and recent Chrome, the pseudo-element covers the rest. A 36px row
 * has no room to give a scrollbar, and stages clipping at the border is the
 * affordance instead.
 */
const SCROLLER_CLASS = "view-bar-scroller";
const SCROLLER_STYLE_ID = "view-bar-scroller-style";
if (
  typeof document !== "undefined" &&
  !document.getElementById(SCROLLER_STYLE_ID)
) {
  const style = document.createElement("style");
  style.id = SCROLLER_STYLE_ID;
  style.textContent =
    `.${SCROLLER_CLASS}{scrollbar-width:none;-ms-overflow-style:none}` +
    `.${SCROLLER_CLASS}::-webkit-scrollbar{display:none;width:0;height:0}`;
  document.head.appendChild(style);
}

const ViewBar: React.FC<{
  /** What this surface may offer; everything, unless the host says less. */
  capabilities?: ViewBarCapabilities;
}> = ({ capabilities = OPEN_CAPABILITIES }) => {
  const servedDefs = useRecoilValue(fos.stageDefinitions);
  const stageDefs = useMemo(
    () => gateDefinitions(servedDefs as StageDefinition[], capabilities),
    [servedDefs, capabilities],
  );
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
   * Puts the keyboard on the trailing insert slot — where describing the next
   * stage begins. Deferred a frame because applying re-renders the bar.
   */
  const focusLastSlot = useCallback(() => {
    requestAnimationFrame(() => {
      // voodo's Stack forwards no ref, so the bar is found by the test id it
      // already carries
      const slots = document
        .querySelector("[data-cy='view-bar']")
        ?.querySelectorAll<HTMLElement>("[aria-label='Insert stage']");
      slots?.[slots.length - 1]?.focus();
    });
  }, []);

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
  // Every slot offers the same stages, so the media-type filter runs once for
  // the bar rather than once per slot
  const insertableNames = useMemo(
    () => stageDefs.filter((d) => appliesTo(d, mediaType)).map((d) => d.name),
    [stageDefs, mediaType],
  );

  const describeStage = useCallback(
    (name: string) => defsByName.get(name)?.description ?? undefined,
    [defsByName],
  );

  /**
   * Inserting mints the id here so the new stage's editor can be opened in the
   * same pass, ready for its first parameter.
   */
  const insertStage = useCallback(
    (cls: string, index: number) => {
      const id = makeId();
      dispatch({
        type: "insertStage",
        index,
        cls,
        id,
        kwargs: defaultKwargs(defsByName.get(cls)?.params ?? []),
      });
      setEditingId(id);
    },
    [defsByName],
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
    // Apply itself vanishes once there is nothing pending, so the keyboard
    // moves to where the next stage starts rather than nowhere
    focusLastSlot();
  }, [paramErrors, serializeWorking, setView, focusLastSlot]);

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
  return (
    <Stack
      orientation={Orientation.Row}
      spacing={Spacing.Xs}
      align={Align.Center}
      // The outer row carries no surface of its own: the gutter below is the
      // bar, and Apply sits beside it rather than inside it
      style={{ width: "100%", height: CHROME_CONTROL_HEIGHT, minWidth: 0 }}
      data-cy="view-bar"
      onKeyDown={(e) => {
        // The editor popover is portaled, so an Escape here means nothing is
        // open: it walks the working state back to what is actually applied.
        // (Escape inside the popover closes it and refocuses the pill, so the
        // next press lands here.)
        if (e.key !== "Escape") return;

        // Pending work goes back to what is applied. With nothing pending
        // there is nothing to undo — but Escape still means "I am done here".
        if (
          viewFingerprint(currentView) !==
          viewFingerprint(serializeWorkingRef.current())
        ) {
          setTouched(new Set());
          setModeOverrides({});
          dispatch({
            type: "hydrate",
            stages: workingStagesFromView(currentView),
          });
        }

        // Either way the bar gives the keyboard back: the stage that held
        // focus may not even exist after a rebuild
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      {/*
        The gutter: the bar's own surface, a darker and cooler one than
        level-2, pulled from the header background so the bar reads as a form
        canvas distinct from the chrome around it. `overflow: hidden` is what
        makes stages disappear into its border as the row scrolls — safe
        because every popout (editor, insert list, tooltips) is portaled.
      */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          height: "100%",
          // Counts its own border, so the bar and the dataset selector are
          // the same height on screen and not one border apart
          boxSizing: "border-box",
          // No padding here: any inset would clip the stages short of the
          // border and show a sliver of this surface beside them
          background: "var(--fo-palette-background-level1)",
          border: "1px solid var(--fo-palette-primary-plainBorder)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div
          className={SCROLLER_CLASS}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            height: "100%",
            // Scrolls sideways for long stage chains; the scrollbar itself is
            // hidden in every engine by SCROLLER_CLASS
            overflowX: "auto",
            overflowY: "hidden",
            flex: 1,
            minWidth: 0,
            // The breathing room lives inside the scroller, so it scrolls
            // away with the content and the stages meet the border exactly
            padding: "0 4px",
          }}
        >
          <InsertSlot
            index={0}
            names={insertableNames}
            describe={describeStage}
            onInsert={insertStage}
          />
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
                <InsertSlot
                  index={i + 1}
                  names={insertableNames}
                  describe={describeStage}
                  onInsert={insertStage}
                />
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Apply — only animates in when the working state diverges from the
          applied view, and lives outside the gutter so the one action that
          runs the view is never scrolled away or clipped by it. */}
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
          anchor={Anchor.Bottom}
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
            // Hidden means hidden: while the wrapper is aria-hidden the
            // button also leaves the tab order
            tabIndex={hasPendingChanges ? undefined : -1}
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
