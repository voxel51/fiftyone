import { executeOperator } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import { useCallback, useMemo, useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  PANEL_NAME,
  QUERY_TYPE_IMAGE,
  QUERY_TYPE_TEXT,
  SCOPE_VIEW,
  SEARCH_OPERATOR_URI,
} from "./constants";
import {
  availableSimilarityKeys,
  buildRunName,
  getQueryIds,
  sortType,
} from "./utils";

const DEFAULT_K = 25;

type UseSimilarityPopoverProps = {
  modal: boolean;
  isImageSearch: boolean;
  close: () => void;
  onSearchStart?: () => void;
  onSearchEnd?: () => void;
};

export default function useSimilarityPopover({
  modal,
  isImageSearch,
  close,
  onSearchStart,
  onSearchEnd,
}: UseSimilarityPopoverProps) {
  const [textQuery, setTextQuery] = useState("");

  const keys = useRecoilValue(
    availableSimilarityKeys({ modal, isImageSearch }),
  );
  const hasSimilarityKeys = keys.length > 0;
  const hasSelectedLabels = useRecoilValue(fos.hasSelectedLabels);
  const selectedLabelsList = useRecoilValue(fos.selectedLabels);

  const selectedLabelFields = useMemo(() => {
    if (!modal || !hasSelectedLabels) return new Set<string>();
    return new Set(selectedLabelsList.map((l) => l.field));
  }, [modal, hasSelectedLabels, selectedLabelsList]);

  const hasMixedFields = selectedLabelFields.size > 1;
  const showMixedFieldWarning = modal && isImageSearch && hasMixedFields;
  const showNoIndexWarning =
    modal && isImageSearch && !hasMixedFields && !hasSimilarityKeys;
  const noIndexWarningText = hasSelectedLabels
    ? "No similarity index found for the selected label field"
    : "No similarity index available";

  const type = useRecoilValue(sortType(modal));
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);
  const [lastUsedBrainKeys, setLastUsedBrainKeys] = useBrowserStorage<
    Record<string, string>
  >("lastUsedBrainKeys", {});

  const resolvedBrainKey = useMemo(() => {
    if (keys.length === 0) return undefined;
    const stored = lastUsedBrainKeys?.[datasetId];
    if (stored && keys.includes(stored)) return stored;
    return keys[0];
  }, [keys, lastUsedBrainKeys, datasetId]);

  const resolvePatchesField = useRecoilCallback(
    ({ snapshot }) =>
      async (brainKey: string) => {
        const methods = await snapshot.getPromise(fos.similarityMethods);
        const match = methods.patches.find(
          ([method]) => method.key === brainKey,
        );
        return match ? match[1] : undefined;
      },
    [],
  );

  const openPanel = useCallback(() => {
    executeOperator("open_panel", {
      name: PANEL_NAME,
      isActive: true,
      layout: "horizontal",
    });
  }, []);

  const handleSearch = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        if (!resolvedBrainKey) return;

        const queryResult = isImageSearch
          ? await getQueryIds(snapshot, resolvedBrainKey)
          : undefined;

        const queryIds = queryResult?.queryIds;
        const negativeQueryIds = queryResult?.negativeQueryIds;

        if (isImageSearch && (!queryIds || queryIds.length === 0)) return;
        if (!isImageSearch && !textQuery.trim()) return;

        const patchesField = await resolvePatchesField(resolvedBrainKey);

        const runName = buildRunName({
          isImageSearch,
          textQuery: textQuery.trim(),
          queryIds,
          negativeQueryIds,
          patchesField,
        });

        const params: Record<string, unknown> = {
          brain_key: resolvedBrainKey,
          query_type: isImageSearch ? QUERY_TYPE_IMAGE : QUERY_TYPE_TEXT,
          query: isImageSearch ? queryIds : textQuery.trim(),
          reverse: false,
          k: DEFAULT_K,
          run_name: runName,
          search_scope: SCOPE_VIEW,
        };
        if (patchesField) {
          params.patches_field = patchesField;
        }
        if (negativeQueryIds && negativeQueryIds.length > 0) {
          params.negative_query_ids = negativeQueryIds;
        }

        setLastUsedBrainKeys({
          ...(lastUsedBrainKeys || {}),
          [datasetId]: resolvedBrainKey,
        });

        close();

        // Close modal and clear selections *before* kicking off the
        // search. The follow-up set_view to ToPatches would otherwise
        // race against a still-open modalSample query whose variables
        // point at a sample id that doesn't exist in the patches view,
        // surfacing as a "sample with id X not found" error.
        if (modal) {
          set(fos.modalSelector, null);
        }
        executeOperator("clear_selected_samples");
        executeOperator("clear_selected_labels");
        set(fos.extendedSelection, { selection: [] });

        onSearchStart?.();

        executeOperator(SEARCH_OPERATOR_URI, params, {
          callback: (result) => {
            onSearchEnd?.();
            if (result?.error) {
              console.error("Similarity search failed:", result.error);
              return;
            }

            if (patchesField) {
              executeOperator(
                "set_view",
                {
                  view: [
                    {
                      _cls: "fiftyone.core.stages.ToPatches",
                      kwargs: [
                        ["field", patchesField],
                        ["_state", null],
                      ],
                    },
                  ],
                },
                { callback: () => openPanel() },
              );
            } else {
              openPanel();
            }
          },
        });
      },
    [
      resolvedBrainKey,
      isImageSearch,
      textQuery,
      resolvePatchesField,
      close,
      openPanel,
      modal,
      lastUsedBrainKeys,
      setLastUsedBrainKeys,
      datasetId,
      onSearchStart,
      onSearchEnd,
    ],
  );

  const handleOpenPanel = useRecoilCallback(
    ({ set }) =>
      () => {
        close();
        if (modal) {
          set(fos.modalSelector, null);
        }
        executeOperator("open_panel", {
          name: PANEL_NAME,
          isActive: true,
          layout: "horizontal",
          data: { view: { page: "new_search" } },
        });
      },
    [close, modal],
  );

  const searchButtonText =
    modal && hasSelectedLabels
      ? "Show similar patches"
      : "Show similar samples";

  return {
    textQuery,
    setTextQuery,
    type,
    hasSimilarityKeys,
    showMixedFieldWarning,
    showNoIndexWarning,
    noIndexWarningText,
    searchButtonText,
    handleSearch,
    handleOpenPanel,
  };
}
