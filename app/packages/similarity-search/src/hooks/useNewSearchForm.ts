import { useEffect, useMemo, useState } from "react";
import { BrainKeyConfig, CloneConfig, QueryType, SearchScope } from "../types";
import { SCOPE_VIEW, SCOPE_DATASET } from "../constants";
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
  onSubmitted: () => void
) => {
  const { selectedLabels, view, hasSamplesSelected, queryIds, hasView } =
    useSearchSelection();

  const firstTextKey = useMemo(
    () => brainKeys.find((bk) => bk.supports_prompts),
    [brainKeys]
  );

  const defaultBrainKey = useMemo(() => {
    if (cloneConfig?.brain_key) return cloneConfig.brain_key;
    if (hasSamplesSelected) return brainKeys[0]?.key ?? "";
    if (firstTextKey) return firstTextKey.key;
    return brainKeys[0]?.key ?? "";
  }, [cloneConfig, hasSamplesSelected, firstTextKey, brainKeys]);

  const defaultQueryType = useMemo((): QueryType => {
    if (cloneConfig?.query_type) return cloneConfig.query_type;
    if (hasSamplesSelected) return "image";
    if (firstTextKey) return "text";
    return "image";
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
  const [searchScope, setSearchScope] = useState<SearchScope>(
    hasView ? SCOPE_VIEW : SCOPE_DATASET
  );

  // ─── Derived config ─────────────────────────────────────────────

  const selectedConfig = brainKeys.find((bk) => bk.key === brainKey);
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? false;

  // ─── Auto-correct effects ───────────────────────────────────────

  useEffect(() => {
    if (!brainKey && brainKeys.length > 0) {
      setBrainKey(brainKeys[0].key);
    }
  }, [brainKey, brainKeys]);

  useEffect(() => {
    if (!supportsPrompts && queryType === "text") {
      setQueryType("image");
    }
  }, [supportsPrompts, queryType]);

  useEffect(() => {
    if (!supportsLeast && reverse) {
      setReverse(false);
    }
  }, [supportsLeast, reverse]);

  // ─── Submission ─────────────────────────────────────────────────

  const {
    executionParams,
    handleClick,
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
    reverse,
    selectedConfig,
    searchScope,
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
    searchScope,
    setSearchScope,
    dynamicResults,
    setDynamicResults,

    // derived
    selectedConfig,
    supportsPrompts,
    supportsLeast,
    queryIds,
    selectedLabels,
    kError,
    canSubmit,
    submitting,
    brainKeyOptions,
    executionParams,

    // handlers
    handleClick,
    handleSuccess,
    handleError,
  };
};
