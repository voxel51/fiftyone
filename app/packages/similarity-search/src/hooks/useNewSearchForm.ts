import { useEffect, useMemo, useState } from "react";
import { useViewTargets } from "@fiftyone/operators";
import { BrainKeyConfig, CloneConfig, QueryType, ViewTarget } from "../types";
import { UploadedImage } from "../utils";
import { useSearchSelection } from "./useSearchSelection";
import { useSearchSubmission } from "./useSearchSubmission";

/**
 * Hook for managing the new search form state.
 *
 * Composes useSearchSelection (FO selection state) and
 * useSearchSubmission (params building + submit handlers).
 */
export const useNewSearchForm = (
  brainKeys: BrainKeyConfig[],
  cloneConfig: CloneConfig | null | undefined,
  onSubmitted: () => void,
) => {
  const {
    selectedLabels,
    view,
    hasSamplesSelected,
    queryIds,
    negativeQueryIds,
    hasView,
  } = useSearchSelection();

  const firstTextKey = useMemo(
    () => brainKeys.find((bk) => bk.supports_prompts),
    [brainKeys],
  );

  const defaultBrainKey = useMemo(() => {
    if (cloneConfig?.brain_key) return cloneConfig.brain_key;
    if (hasSamplesSelected) return brainKeys[0]?.key ?? "";
    if (firstTextKey) return firstTextKey.key;
    return brainKeys[0]?.key ?? "";
  }, [cloneConfig, hasSamplesSelected, firstTextKey, brainKeys]);

  const defaultQueryType = useMemo((): QueryType => {
    if (cloneConfig?.query_type) return cloneConfig.query_type;
    if (hasSamplesSelected) return QueryType.Image;
    if (firstTextKey) return QueryType.Text;
    return QueryType.Image;
  }, [cloneConfig, hasSamplesSelected, firstTextKey]);

  // ─── Form fields ────────────────────────────────────────────────

  const [brainKey, setBrainKey] = useState(defaultBrainKey);
  const [queryType, setQueryType] = useState<QueryType>(defaultQueryType);
  const [textQuery, setTextQuery] = useState(cloneConfig?.query ?? "");
  const [k, setK] = useState<number | "">(cloneConfig?.k ?? 25);
  const [reverse, setReverse] = useState(cloneConfig?.reverse ?? false);
  const [distField, setDistField] = useState(cloneConfig?.dist_field ?? "");
  const [runName, setRunName] = useState("");
  const [dynamicResults, setDynamicResults] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(
    null,
  );
  // which targets a search may process, and why one is unavailable, is
  // resolved by the shared operator module; this panel offers only the
  // whole-collection and current-view targets
  const { targets, defaultTarget } = useViewTargets();
  const viewTargetOptions = useMemo(
    () => targets.filter((meta) => meta.target !== ViewTarget.SELECTED_SAMPLES),
    [targets],
  );
  const [viewTarget, setViewTarget] = useState<ViewTarget>(defaultTarget);
  const isGroupedDataset = Boolean(
    viewTargetOptions.find((meta) => meta.target === ViewTarget.DATASET)
      ?.unavailableReason,
  );

  // ─── Derived config ─────────────────────────────────────────────

  const selectedConfig = brainKeys.find((bk) => bk.key === brainKey);
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? false;
  const supportsUpload =
    typeof selectedConfig?.model === "string" &&
    selectedConfig.model.trim().length > 0;

  // ─── Auto-correct effects ───────────────────────────────────────

  useEffect(() => {
    if (!brainKey && brainKeys.length > 0) {
      setBrainKey(brainKeys[0].key);
    }
  }, [brainKey, brainKeys]);

  useEffect(() => {
    if (!supportsPrompts && queryType === QueryType.Text) {
      setQueryType(QueryType.Image);
    }
  }, [supportsPrompts, queryType]);

  useEffect(() => {
    if (!supportsLeast && reverse) {
      setReverse(false);
    }
  }, [supportsLeast, reverse]);

  useEffect(() => {
    if (!supportsUpload && queryType === QueryType.Upload) {
      setQueryType(QueryType.Image);
      setUploadedImage(null);
    }
  }, [supportsUpload, queryType]);

  // move off targets reported as unavailable (e.g. after a dataset change);
  // `defaultTarget` is already the best available target, resolved centrally
  useEffect(() => {
    const current = viewTargetOptions.find(
      (meta) => meta.target === viewTarget,
    );
    if (current && current.unavailableReason === undefined) {
      return;
    }

    if (defaultTarget !== viewTarget) {
      setViewTarget(defaultTarget);
    }
  }, [viewTargetOptions, defaultTarget, viewTarget]);

  // ─── Submission ─────────────────────────────────────────────────

  const {
    executionParams,
    handleOptionSelected,
    handleSuccess,
    handleError,
    kError,
    canSubmit,
    submitting,
  } = useSearchSubmission({
    brainKey,
    queryType,
    textQuery,
    queryIds,
    negativeQueryIds,
    uploadedImage,
    reverse,
    selectedConfig,
    viewTarget,
    hasView,
    view: view as unknown[],
    k,
    distField,
    runName,
    dynamicResults,
    onSubmitted,
  });

  // ─── Brain key options ──────────────────────────────────────────

  const brainKeyOptions = brainKeys.map((bk) => ({
    id: bk.key,
    data: {
      label:
        bk.key + (bk.patches_field ? ` (patches: ${bk.patches_field})` : ""),
    },
  }));

  return {
    // form state
    brainKey,
    setBrainKey,
    queryType,
    setQueryType,
    textQuery,
    setTextQuery,
    k,
    setK,
    reverse,
    setReverse,
    distField,
    setDistField,
    runName,
    setRunName,
    viewTarget,
    setViewTarget,
    viewTargetOptions,
    isGroupedDataset,
    dynamicResults,
    setDynamicResults,
    uploadedImage,
    setUploadedImage,

    // derived
    selectedConfig,
    supportsPrompts,
    supportsLeast,
    supportsUpload,
    queryIds,
    negativeQueryIds,
    selectedLabels,
    kError,
    canSubmit,
    submitting,
    brainKeyOptions,
    executionParams,

    // handlers
    handleOptionSelected,
    handleSuccess,
    handleError,
  };
};
