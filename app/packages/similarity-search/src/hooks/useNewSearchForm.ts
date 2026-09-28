import { useEffect, useMemo, useState } from "react";
import { useViewTargets } from "@fiftyone/operators";
import {
  AnnotatedBrainKeyConfig,
  CloneConfig,
  QueryType,
  ViewTarget,
} from "../types";
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
  brainKeys: AnnotatedBrainKeyConfig[],
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

  // Incompatible keys are rendered (grayed out) but never selectable
  const compatibleKeys = useMemo(
    () => brainKeys.filter((bk) => bk.compatible),
    [brainKeys],
  );

  const firstTextKey = useMemo(
    () => compatibleKeys.find((bk) => bk.supports_prompts),
    [compatibleKeys],
  );

  const defaultBrainKey = useMemo(() => {
    if (
      cloneConfig?.brain_key &&
      compatibleKeys.some((bk) => bk.key === cloneConfig.brain_key)
    ) {
      return cloneConfig.brain_key;
    }
    if (hasSamplesSelected) return compatibleKeys[0]?.key ?? "";
    if (firstTextKey) return firstTextKey.key;
    return compatibleKeys[0]?.key ?? "";
  }, [cloneConfig, hasSamplesSelected, firstTextKey, compatibleKeys]);

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
  const { targets, defaultTarget } = useViewTargets({ requireFlat: true });
  const viewTargetOptions = useMemo(
    () => targets.filter((meta) => meta.target !== ViewTarget.SELECTED_SAMPLES),
    [targets],
  );
  const [viewTarget, setViewTarget] = useState<ViewTarget>(defaultTarget);

  // ─── Derived config ─────────────────────────────────────────────

  // Derived during render rather than via the auto-correct effect so
  // the frame where a view change invalidates the selected key never
  // exposes an undefined config (which would flip queryType off Text)
  const effectiveBrainKey = compatibleKeys.some((bk) => bk.key === brainKey)
    ? brainKey
    : (compatibleKeys[0]?.key ?? "");

  const selectedConfig = compatibleKeys.find(
    (bk) => bk.key === effectiveBrainKey,
  );
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? false;
  const supportsUpload =
    typeof selectedConfig?.model === "string" &&
    selectedConfig.model.trim().length > 0;

  // ─── Auto-correct effects ───────────────────────────────────────

  useEffect(() => {
    // Sync state to the render-derived effective key (covers a
    // selected key becoming incompatible when the view changes while
    // the form is open)
    if (brainKey !== effectiveBrainKey) {
      setBrainKey(effectiveBrainKey);
    }
  }, [brainKey, effectiveBrainKey]);

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

  useEffect(() => {
    const current = viewTargetOptions.find(
      (meta) => meta.target === viewTarget,
    );
    if (!current || current.unavailableReason !== undefined) {
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
    brainKey: effectiveBrainKey,
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

  return {
    // form state
    brainKey: effectiveBrainKey,
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
    executionParams,

    // handlers
    handleOptionSelected,
    handleSuccess,
    handleError,
  };
};
