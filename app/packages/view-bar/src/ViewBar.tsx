/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * The dataset view bar: a horizontal row of stage cards, each with a
 * dynamic form keyed by the stage's parameter definitions, and an
 * insertion slot between every pair of stages. Local React state owns
 * the in-progress edit; finishing a stage or leaving the bar serializes the
 * whole working state and pushes it through `fos.useSetView`.
 *
 * Stage schemas come from the `stageDefinitions` atom, which mirrors
 * the server's `fiftyone/core/stages.py`. Param `type` strings are
 * pipe-delimited alternatives — see {@link pickInput} for how each
 * type token maps to a voodo input. `NoneType` in the alternative set
 * marks the field as optional.
 */

import { useTrackEvent } from "@fiftyone/analytics";
import { executeOperator, useOperatorAvailability } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { buildSimilarityRunName } from "@fiftyone/utilities";
import {
  Align,
  Anchor,
  Clickable,
  Icon,
  IconName,
  Orientation,
  Popover,
  Size,
  Spacing,
  Stack,
  Text,
  TextBadge,
  TextColor,
  TextVariant,
  Tooltip,
  ZIndex,
} from "@voxel51/voodo";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import { kindsByFtype, operatorsFrom } from "./builder/catalog";
import { fromSource, isEnvelope, sourceOf } from "./builder/envelope";
import { ClearViewButton } from "./ClearViewButton";
import { allowedFields } from "./fields";
import { InsertSlot } from "./InsertSlot";
import { LanguageSearch } from "./LanguageSearch";
import styles from "./ViewBar.module.css";
import {
  orderBySearchRecency,
  readIndexUses,
  readMatches,
  recordIndexUse,
  recordMatches,
} from "./searchIndexRecency";
import { readSearchQueries, recordSearchQuery } from "./searchQueryHistory";
import { patchesFieldOfView, resolveSearchIndex } from "./searchIndexSelection";
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
import { CHROME_CONTROL_HEIGHT, StageCard } from "./StageCard";
import {
  rankStages,
  readRecentStages,
  recordRecentStage,
} from "./stage-ranking";
import {
  initialState,
  makeId,
  NO_ERRORS,
  NO_KINDS,
  reducer,
  viewFingerprint,
  workingStagesFromView,
} from "./state";
import { usePrefixSchema } from "./prefix-schema";
import type { SerializedStage } from "./state";
import type { WorkingStage } from "./state";

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
 * How many samples a typed language query keeps, matching the modal
 * similarity search's default. The stage lands in the bar as a normal
 * pill, so the value is one click away from being changed.
 */
const LANGUAGE_SEARCH_K = 25;

/** The Similarity action's server-side search operator. */
const SIMILARITY_SEARCH_OPERATOR = "@voxel51/panels/similarity_search";

const ViewBarInner: React.FC<{
  /** What this surface may offer; everything, unless the host says less. */
  capabilities?: ViewBarCapabilities;
}> = ({ capabilities = OPEN_CAPABILITIES }) => {
  const servedDefs = fos.useStageDefinitions();
  const stageDefs = useMemo(
    () => gateDefinitions(servedDefs as StageDefinition[], capabilities),
    [servedDefs, capabilities],
  );
  const fieldPaths = fos.useFieldPaths({});
  const fieldTypes = fos.useFieldTypes();
  const mediaType = fos.useDatasetMediaType();
  const currentView = fos.useView();
  const datasetName = fos.useCurrentDatasetName();
  const setView = fos.useSetView();
  const setViewChangePending = fos.useSetViewChangePending();
  const trackEvent = useTrackEvent();

  const [state, dispatch] = useReducer(reducer, initialState);
  // Whether the stages row (the second row, under the search bar) is shown.
  // Only actions IN the bar open it — the toggle and adding a stage. A view
  // arriving from outside (a saved view, an operator, the URL, a quick
  // search landing) stays folded behind the toggle's count badge.
  const [stagesOpen, setStagesOpen] = React.useState(false);
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
  // What setView was last given, normalized to what the bar will hold:
  // `fos.view` lags a round-trip behind, and that gap must not read as
  // pending work — clearing or searching would flash Apply for one echo
  const [inFlight, setInFlight] = React.useState<string | null>(null);
  // Search chaining: the run a submitted search created, then — once its
  // view lands — the fingerprint of that view. A following search typed
  // over an unmodified result view REPLACES the search (via the run's
  // recorded base) instead of refining 25 results down to 25 results.
  const pendingSearchRunId = React.useRef<string | null>(null);
  const lastSearch = React.useRef<{
    runId: string;
    viewFp: string;
  } | null>(null);

  /**
   * Puts the keyboard on the trailing insert slot — where describing the next
   * stage begins. Deferred a frame because applying re-renders the bar; the
   * frame is dropped if the bar unmounts first.
   */
  const focusFrameRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) {
        cancelAnimationFrame(focusFrameRef.current);
      }
    },
    [],
  );
  const focusLastSlot = useCallback(() => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current);
    }
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      // The stages row is portaled, so it is found by its own test id. An
      // empty row pins its slot open as a typeahead input; otherwise the
      // slots are "+" buttons and the last one is where the next stage goes.
      const row = document.querySelector("[data-cy='view-bar-stages-row']");
      if (!row) return;
      const typeahead = row.querySelector<HTMLElement>(
        "[data-cy='view-bar-insert-typeahead']",
      );
      if (typeahead) {
        typeahead.focus();
        return;
      }
      const slots = row.querySelectorAll<HTMLElement>(
        "[data-cy='view-bar-insert-slot']",
      );
      slots[slots.length - 1]?.focus();
    });
  }, []);

  /**
   * Finishing a stage IS applying it: the same key that finished the stage
   * runs the view, matching the text search's Enter. `apply` is declared
   * below (it needs the serializer); the ref carries the latest instance.
   * Leaving the bar applies too (see the blur handling below); an incomplete
   * draft is the one thing neither path applies.
   */
  const applyFnRef = React.useRef<() => void>(() => undefined);
  const commitStage = useCallback(() => {
    setEditingId(null);
    applyFnRef.current();
  }, []);

  /**
   * Auto-apply queued behind a reducer dispatch: the dispatch's state lands
   * next render, so applying immediately would serialize the OLD stages.
   * Consumed by an effect below once the new state is in.
   */
  const autoApplyQueued = React.useRef(false);

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
      // A just-searched run owns the arriving view; any other view change
      // supersedes the chain and a next search targets the view as-is
      if (pendingSearchRunId.current) {
        lastSearch.current = {
          runId: pendingSearchRunId.current,
          viewFp: viewFingerprint(currentView),
        };
        pendingSearchRunId.current = null;
      } else if (
        lastSearch.current &&
        viewFingerprint(currentView) !== lastSearch.current.viewFp
      ) {
        lastSearch.current = null;
      }

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
      // Whatever was in transit has landed (or been superseded externally)
      setInFlight(null);
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
  // Recency lives per browser; reading it once per mount is enough because
  // this bar is the only writer
  const [recentStages, setRecentStages] =
    React.useState<string[]>(readRecentStages);

  // Every slot offers the same stages, so the media-type filter and ranking
  // run once for the bar rather than once per slot
  const insertableNames = useMemo(
    () =>
      rankStages(
        stageDefs.filter((d) => appliesTo(d, mediaType)).map((d) => d.name),
        recentStages,
      ),
    [stageDefs, mediaType, recentStages],
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
      setRecentStages(recordRecentStage(cls));
      trackEvent("view_bar_stage_added", { stage: cls });
      setStagesOpen(true);
    },
    [defsByName, trackEvent],
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
  const similarityKeys = fos.useSimilarityKeys();
  const groupSlices = fos.useGroupSlices(ALL_SLICE_MEDIA_TYPES);
  const choicesFor = useCallback(
    (param: ParamDef): string[] => {
      switch (param.choices.source) {
        case "GROUP_SLICES":
          return groupSlices;
        case "EVALUATION_KEYS":
          return evaluationKeys;
        case "SIMILARITY_KEYS":
          return similarityKeys;
        default:
          return [...param.choices.values];
      }
    },
    [groupSlices, evaluationKeys, similarityKeys],
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
  const serializeStages = useCallback(
    (stages: readonly WorkingStage[]) => {
      const isEmpty = isEmptyValue;
      return stages.map((s) => {
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
            // The json editor holds text; the server takes the document it
            // parses to — as a string, `MapLabels(map='{...}')` is a type error.
            // Validation gated Apply on parseability, so the fallthrough only
            // covers an envelope shown as its lowering, which passes through.
            if (
              kind === "json" &&
              typeof value === "string" &&
              !isEnvelope(value)
            ) {
              try {
                return [p.name, JSON.parse(value)];
              } catch {
                return [p.name, value];
              }
            }
            return [p.name, value];
          });
        return { _cls: `fiftyone.core.stages.${s.cls}`, kwargs };
      });
    },
    [defsByName, kindOf],
  );

  const serializeWorking = useCallback(
    () => serializeStages(state.stages),
    [serializeStages, state.stages],
  );

  /**
   * What a just-sent payload reads as once the bar rebuilds from it —
   * kwargs normalized through the descriptors, exactly what
   * `hasPendingChanges` will compare. Fingerprinting the raw payload
   * instead leaves a hand-built stage (a typed search) reading as pending
   * for the length of a server round-trip.
   */
  const inFlightFingerprint = useCallback(
    (serialized: SerializedStage[]) =>
      viewFingerprint(serializeStages(workingStagesFromView(serialized))),
    [serializeStages],
  );

  //
  // A stage edits against the view the stages BEFORE it produce — resolving
  // fields on the view it is part of offers the wrong schema once a generator
  // stage (`ToPatches`, `ToClips`, …) has run. The open editor gets the prefix
  // view's schema; the applied view's remains right for everything else.
  //
  const editingIndex = editingId
    ? state.stages.findIndex((stage) => stage.id === editingId)
    : -1;
  const editingPrefix = useMemo(
    () => (editingIndex < 0 ? null : serializeWorking().slice(0, editingIndex)),
    [editingIndex, serializeWorking],
  );
  const prefixSchema = usePrefixSchema(datasetName, editingPrefix);

  const editingPaths = prefixSchema?.paths ?? fieldPaths;
  const editingTypes = prefixSchema?.types ?? fieldTypes;
  const editingFieldOptions = useMemo(
    () =>
      editingPaths.map((path) => ({
        id: path,
        data: { label: path },
      })),
    [editingPaths],
  );
  const editingAllowedFor = useCallback(
    (param: ParamDef) =>
      allowedFields(editingPaths, param.choices.fields, editingTypes),
    [editingPaths, editingTypes],
  );
  const editingFieldKind = useCallback(
    (path: string) => {
      const field = editingTypes.get(path);
      return field ? kindByFtype.get(field.ftype) : undefined;
    },
    [editingTypes, kindByFtype],
  );

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

  React.useEffect(() => {
    if (inFlight !== null && viewFingerprint(currentView) === inFlight) {
      setInFlight(null);
    }
  }, [currentView, inFlight]);

  const apply = useCallback(() => {
    if (paramErrors.labels.length) return;
    const serialized = serializeWorking();
    setView(serialized);
    setInFlight(inFlightFingerprint(serialized));
    trackEvent("view_bar_view_applied", { stages: serialized.length });
    // Rebuild the bar from exactly what was sent, so an applied expression
    // reopens printed from its envelope — `F("x")` as typed becomes the
    // canonical `F('x')` — without waiting on any echo from the server
    dispatch({ type: "hydrate", stages: workingStagesFromView(serialized) });
    // The keyboard moves to where the next stage starts
    focusLastSlot();
  }, [
    paramErrors,
    serializeWorking,
    inFlightFingerprint,
    setView,
    trackEvent,
    focusLastSlot,
  ]);

  applyFnRef.current = apply;

  useEffect(() => {
    if (autoApplyQueued.current) {
      autoApplyQueued.current = false;
      apply();
    }
  });

  // ----- Collapsed bar: summary chip + language search -----

  const promptKeys = fos.usePromptableSimilarityKeys();
  // The search runs through the similarity_search operator — a deployment
  // whose plugins never registered (or an install without them) must not
  // offer a box whose Enter goes nowhere
  const searchOperatorAvailable = useOperatorAvailability(
    SIMILARITY_SEARCH_OPERATOR,
  );
  // The language search turns Enter into a SortBySimilarity stage, so it
  // needs a prompt-capable index and the stage itself to be offerable here
  const searchEnabled =
    searchOperatorAvailable &&
    promptKeys.length > 0 &&
    defsByName.has("SortBySimilarity");

  // The search settings popover: which index the search uses and how many
  // matches it asks for. Default ordering = the top 5 indexes actually
  // searched with in the past week (most recent first), then newest-created;
  // an explicit pick overrides. Session-local pick; per-dataset recency.
  const [searchIndexKey, setSearchIndexKey] = React.useState<string | null>(
    null,
  );
  const [searchK, setSearchK] = React.useState(
    () => (datasetName ? readMatches(datasetName) : null) ?? LANGUAGE_SEARCH_K,
  );
  const changeSearchK = useCallback(
    (k: number) => {
      setSearchK(k);
      if (datasetName) {
        recordMatches(datasetName, k);
      }
    },
    [datasetName],
  );
  // bumps after every search so the ordering reflects the use just recorded
  const [recencyStamp, setRecencyStamp] = React.useState(0);
  const searchHistory = useMemo(
    () => (datasetName ? readSearchQueries(datasetName) : []),
    // recencyStamp invalidates the localStorage read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datasetName, recencyStamp],
  );
  const orderedPromptKeys = useMemo(
    () =>
      orderBySearchRecency(
        promptKeys,
        datasetName ? readIndexUses(datasetName) : {},
      ),
    // recencyStamp invalidates the localStorage read
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [promptKeys, datasetName, recencyStamp],
  );
  // A view standing in patches prefers a patches index on its field: a
  // sample-level index cannot rank patches, and the server would flatten
  // the view (dropping ToPatches) to satisfy it. An explicit pick wins.
  const viewPatchesField = useMemo(
    () => patchesFieldOfView(currentView),
    [currentView],
  );
  const resolvedSearchIndex = resolveSearchIndex(
    orderedPromptKeys,
    searchIndexKey,
    viewPatchesField,
  );

  const openSimilarityPanel = useCallback(() => {
    trackEvent("view_bar_search_settings_panel_opened");
    executeOperator("open_panel", {
      name: "similarity_search_panel",
      isActive: true,
      layout: "horizontal",
    });
  }, [trackEvent]);

  // Bumped when the view clears: the search box remounts empty — a typed
  // query describes the view that was just discarded
  const [searchEpoch, setSearchEpoch] = React.useState(0);
  // Whether the search input holds text — its inline [x] then stands in for
  // the bar's clear-view [x]
  const [searchHasText, setSearchHasText] = React.useState(false);

  /** The bar's one [x]: back to the root view — stages, drafts, search text. */
  const clearView = useCallback(() => {
    setTouched(new Set());
    setModeOverrides({});
    setEditingId(null);
    setSearchEpoch((epoch) => epoch + 1);
    // An emptied bar folds back to the single search row
    setStagesOpen(false);
    setView([]);
    setInFlight(inFlightFingerprint([]));
    trackEvent("view_bar_view_cleared");
    dispatch({ type: "hydrate", stages: [] });
  }, [setView, inFlightFingerprint, trackEvent]);

  const submitLanguageQuery = useCallback(
    (query: string) => {
      // The settings popover's picked index, else the most recently computed
      // prompt-capable one — never an index that cannot embed the typed prompt
      const index = resolvedSearchIndex;
      if (!index) return;
      if (datasetName) {
        recordIndexUse(datasetName, index.key);
        recordSearchQuery(datasetName, query);
        setRecencyStamp((stamp) => stamp + 1);
      }
      trackEvent("view_bar_text_search", {
        patches: Boolean(index.patchesField),
      });
      // The pending treatment every view change gets, for the operator's
      // whole run — the router clears it when the resulting entry loads
      setViewChangePending(true);
      // The same route the Similarity action takes: the server-side search
      // operator owns building and applying the view, and the bar hydrates
      // from the view change like any other external edit
      const params: Record<string, unknown> = {
        brain_key: index.key,
        query_type: "text",
        query,
        reverse: false,
        k: searchK,
        run_name: buildSimilarityRunName({
          isImageSearch: false,
          textQuery: query,
          patchesField: index.patchesField ?? undefined,
        }),
        view_target: "CURRENT_VIEW",
        // The run applies its own results — the same view the panel's
        // Apply builds, without needing the panel
        apply_results: true,
      };
      if (index.patchesField) {
        params.patches_field = index.patchesField;
      }
      if (
        lastSearch.current &&
        viewFingerprint(currentView) === lastSearch.current.viewFp
      ) {
        // Typed over an unmodified result view: replace that search
        params.replace_run_id = lastSearch.current.runId;
      }
      executeOperator(SIMILARITY_SEARCH_OPERATOR, params, {
        callback: (result) => {
          if (result?.error) {
            // No view change is coming, so nothing will clear the pending
            // treatment — release it here
            setViewChangePending(false);
            console.error("Similarity search failed:", result.error);
            return;
          }
          pendingSearchRunId.current =
            (result?.result as { run_id?: string } | undefined)?.run_id ?? null;
        },
      });
    },
    [
      resolvedSearchIndex,
      datasetName,
      trackEvent,
      setViewChangePending,
      currentView,
      searchK,
    ],
  );

  // Unset follows the view: stages present means the row starts visible
  const stagesRowOpen = stagesOpen;
  // Opening via the toggle lands the keyboard in the row. The popover mounts
  // its panel in the same commit that opens it, so the slot is there to focus
  const focusOnOpen = useRef(false);
  useEffect(() => {
    if (stagesRowOpen && focusOnOpen.current) {
      focusOnOpen.current = false;
      focusLastSlot();
    }
  }, [stagesRowOpen, focusLastSlot]);

  serializeWorkingRef.current = serializeWorking;

  //
  // Leaving the bar closes the editor and, with no manual Apply anywhere,
  // finishes the edit: a working state that differs from the applied view and
  // has nothing left to fill in applies itself. A half-described stage stays
  // as a pill saying what it needs — work in progress, not a mistake to undo.
  // Leaving is what the stages-row popover reports: a press outside the bar,
  // the row and every portaled popout, or Escape at the bar level.
  //
  const applyOnLeaveRef = useRef<() => void>(() => undefined);

  /**
   * Whether the working state differs from what is applied to the view; only
   * then does finishing a stage or leaving the bar push anything. Compared on
   * the SERIALIZED shape (the payload that would be pushed), so kwarg-order
   * differences and dropped-empty kwargs are not false positives.
   */
  const hasPendingChanges = useMemo(() => {
    const working = viewFingerprint(serializeWorking());
    // A working state that matches what was just sent is applied work still
    // in flight, not pending work
    return working !== viewFingerprint(currentView) && working !== inFlight;
  }, [serializeWorking, currentView, inFlight]);

  applyOnLeaveRef.current = () => {
    // A stage still missing required values is not finished — it stays a
    // pill; apply() itself refuses anything invalid
    if (hasPendingChanges && paramErrors.labels.length === 0) {
      apply();
    }
  };

  /** Folding the row finishes the work in it: valid pending stages apply. */
  const closeStagesRow = useCallback(() => {
    setEditingId(null);
    applyOnLeaveRef.current();
    setStagesOpen(false);
  }, []);

  const toggleStagesRow = useCallback(() => {
    if (stagesRowOpen) {
      closeStagesRow();
      return;
    }
    // Opening lands the keyboard where the next stage starts
    focusOnOpen.current = true;
    setStagesOpen(true);
  }, [stagesRowOpen, closeStagesRow]);

  /**
   * The bar's Escape: the editor popover is portaled, so an Escape here means
   * nothing is open — it walks the working state back to what is applied and
   * hands the keyboard back. Shared by both rows (the stages row is portaled,
   * so key events there do not bubble here).
   */
  const onBarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape") return;

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

    // Escaping the bar is leaving it: the stages row folds away too
    setEditingId(null);
    setStagesOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  /**
   * Two rows. The first is the search bar — always present: the similarity
   * input with its magnifying-glass settings, and the stages toggle at the
   * right edge. The second is the stages row (slots, pills, editors),
   * portaled under the bar because the header the bar lives in cannot grow.
   */
  // The gutter: the bar's own surface — the search row's canvas. It is the
  // popover's trigger only in the sense of being what the stages row hangs
  // from; the bar decides when the row opens (the toggle, adding a stage) and
  // the popover reports a press outside everything as leaving.
  const gutter = (
    <div className={styles.gutter}>
      {searchOperatorAvailable ? (
        <LanguageSearch
          key={`search-${searchEpoch}`}
          onHasTextChange={setSearchHasText}
          onSubmit={submitLanguageQuery}
          enabled={searchEnabled}
          history={searchHistory}
          promptKeys={orderedPromptKeys}
          selectedKey={resolvedSearchIndex?.key ?? null}
          onSelectKey={setSearchIndexKey}
          k={searchK}
          onChangeK={changeSearchK}
          onOpenPanel={openSimilarityPanel}
        />
      ) : (
        // No similarity_search operator (plugins absent): a search box
        // whose every path dead-ends is hidden, not disabled
        <div className={styles.spacer} aria-hidden="true" />
      )}
      {/* THE one [x]: clears every stage and any search text, and it lives
            on the always-visible first row so it stays reachable while the
            stages row is folded. It sits before the toggle's divider. */}
      {(state.stages.length > 0 || searchHasText) && (
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.None}
          align={Align.Center}
          className={styles.clearSlot}
        >
          <ClearViewButton onClear={clearView} />
        </Stack>
      )}
      {/* The stages toggle: opens the second row where the view is built.
            Carries the stage count so an applied view stays discoverable
            while the row is folded away. */}
      <Tooltip
        anchor={Anchor.Bottom}
        content={stagesRowOpen ? "Hide view stages" : "View stages"}
      >
        <Clickable
          role="button"
          tabIndex={0}
          aria-label="View stages"
          aria-expanded={stagesRowOpen}
          data-cy="view-bar-stages-toggle"
          onClick={toggleStagesRow}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleStagesRow();
            }
          }}
          className={styles.stagesToggle}
        >
          <Icon
            name={IconName.Sliders}
            size={Size.Sm}
            color={stagesRowOpen ? TextColor.Primary : TextColor.Secondary}
          />
          <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
            Stages
          </Text>
          {state.stages.length > 0 && (
            <TextBadge
              color={TextColor.Secondary}
              className={styles.stagesCount}
            >
              {state.stages.length}
            </TextBadge>
          )}
        </Clickable>
      </Tooltip>
    </div>
  );

  return (
    <Popover
      className={styles.bar}
      style={{ height: CHROME_CONTROL_HEIGHT }}
      data-cy="view-bar"
      onKeyDown={onBarKeyDown}
      trigger={gutter}
      open={stagesRowOpen}
      onOpenChange={(open) => {
        if (!open && stagesRowOpen) closeStagesRow();
      }}
      // The row spans the bar, and sits under the tooltips and editors that
      // open from inside it
      matchTriggerWidth
      zIndex={ZIndex.High}
      // Escape belongs to the bar: it walks working state back, and folds the
      // row itself (onBarKeyDown), so the popover must not also close on it
      closeOnEscape={false}
      // Focus is placed by the effect above — on the row's slot, when the
      // toggle opened it; not on the panel when a stage was added
      focusOnOpen={false}
      panelClassName={styles.stagesRow}
    >
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.None}
        align={Align.Center}
        data-cy="view-bar-stages-row"
        onKeyDown={onBarKeyDown}
        style={{ height: CHROME_CONTROL_HEIGHT }}
      >
        <Stack
          orientation={Orientation.Row}
          spacing={Spacing.Xs}
          align={Align.Center}
          className={styles.scroller}
          data-cy="view-bar-scroller"
        >
          <InsertSlot
            index={0}
            names={insertableNames}
            describe={describeStage}
            onInsert={insertStage}
            // An empty row's slot IS the selector, input and all — a
            // bare "+" alone in the row reads as a rendering failure
            pinned={state.stages.length === 0}
          />
          {state.stages.map((stage, i) => {
            const def = defsByName.get(stage.cls);
            if (!def) return null;
            return (
              <React.Fragment key={stage.id}>
                <StageCard
                  errors={visibleErrors.get(stage.id) ?? NO_ERRORS}
                  // A stage holding a rejected value is invalid; one
                  // merely missing required values is incomplete —
                  // orange says "finish me", red says "fix me"
                  invalid={[
                    ...(paramErrors.byStage.get(stage.id)?.values() ?? []),
                  ].some((message) => message !== "Required")}
                  kinds={activeKinds.get(stage.id) ?? NO_KINDS}
                  onModeChange={(param, kind) => changeMode(stage, param, kind)}
                  stage={stage}
                  definition={def}
                  fieldOptions={
                    editingId === stage.id ? editingFieldOptions : fieldOptions
                  }
                  allPaths={editingId === stage.id ? editingPaths : fieldPaths}
                  allowedFor={
                    editingId === stage.id ? editingAllowedFor : allowedFor
                  }
                  choicesFor={choicesFor}
                  operators={operators}
                  fieldKind={
                    editingId === stage.id ? editingFieldKind : fieldKind
                  }
                  expanded={editingId === stage.id}
                  onToggle={() =>
                    setEditingId((id) => (id === stage.id ? null : stage.id))
                  }
                  onChange={(name, value) => {
                    markTouched(stage.id, name);
                    dispatch({
                      type: "setKwarg",
                      id: stage.id,
                      name,
                      value,
                    });
                  }}
                  onCommit={commitStage}
                  onRemove={() => {
                    if (editingId === stage.id) setEditingId(null);
                    dispatch({ type: "removeStage", id: stage.id });
                    // Removing a stage is a finished edit — apply once
                    // the reducer's state lands (next render)
                    autoApplyQueued.current = true;
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
        </Stack>
      </Stack>
    </Popover>
  );
};

/**
 * The bar remounts per dataset: every piece of its local state — working
 * stages, drafts, the stages-row toggle, the search box — describes ONE
 * dataset, and the per-dataset conveniences (match count, index recency,
 * query history) initialize on mount.
 */
const ViewBar: React.FC<{
  capabilities?: ViewBarCapabilities;
}> = (props) => {
  const datasetName = fos.useCurrentDatasetName();
  return <ViewBarInner key={datasetName ?? ""} {...props} />;
};

export default ViewBar;
