import { atom, useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useCurrentDatasetId } from "@fiftyone/state";
import {
  ListValidAnnotationFieldsRequest,
  ListValidAnnotationFieldsResponse,
  useSchemaManager,
} from "./useSchemaManager";

/**
 * Atom containing a mapping of dataset ID -> valid annotation fields list
 */
const validFieldsAtom = atom<Record<string, string[]>>({});

/**
 * Atom containing a mapping of dataset ID -> is request in flight
 */
const requestInFlightAtom = atom<Record<string, boolean>>({});

/**
 * Atom containing a mapping of dataset ID -> has request resolved
 */
const isResolvedAtom = atom<Record<string, boolean>>({});

/**
 * Write-only atom which fetches the valid annotation fields for a given
 * dataset ID.
 *
 * This method is idempotent; if a request is in flight, or has already
 * resolved, then an additional request is not made.
 */
const initializeSampleAtom = atom(
  null,
  async (
    get,
    set,
    datasetId: string,
    listValidFields: (
      request: ListValidAnnotationFieldsRequest
    ) => Promise<ListValidAnnotationFieldsResponse>
  ) => {
    if (get(requestInFlightAtom)[datasetId] || get(isResolvedAtom)[datasetId]) {
      return;
    }

    set(requestInFlightAtom, (prev) => ({ ...prev, [datasetId]: true }));

    try {
      const response = await listValidFields({});
      set(validFieldsAtom, (prev) => ({
        ...prev,
        [datasetId]: response.valid_fields,
      }));
    } catch (err) {
      console.warn("Failed to fetch annotation fields", err);
    } finally {
      set(requestInFlightAtom, (prev) => ({ ...prev, [datasetId]: false }));
      set(isResolvedAtom, (prev) => ({ ...prev, [datasetId]: true }));
    }
  }
);

/**
 * Return type for the {@link useValidAnnotationFields} hook.
 */
export type UseValidAnnotationFields = {
  /**
   * Refresh the cached data for the current dataset.
   */
  refresh: () => void;

  /**
   * If true, {@link validFields} can be considered ready to consume.
   */
  resolved: boolean;

  /**
   * List of valid annotation fields for the current sample.
   */
  validFields: string[];
};

/**
 * Hook which provides a list of valid annotation fields for the current sample.
 */
export const useValidAnnotationFields = (): UseValidAnnotationFields => {
  const [validFieldsMap, setValidFieldsMap] = useAtom(validFieldsAtom);
  const [resolvedMap, setResolvedMap] = useAtom(isResolvedAtom);
  const initializeSample = useSetAtom(initializeSampleAtom);
  const { listValidAnnotationFields } = useSchemaManager();

  const datasetId = useCurrentDatasetId();

  const refresh = useCallback(() => {
    if (datasetId) {
      setValidFieldsMap((prev) => ({ ...prev, [datasetId]: [] }));
      setResolvedMap((prev) => ({ ...prev, [datasetId]: false }));

      initializeSample(datasetId, listValidAnnotationFields);
    }
  }, [datasetId]);

  // Fetch data on dataset change.
  // Note that if the schema is updated via the schema manager, the cached
  // list of valid fields may become stale.
  useEffect(() => {
    if (datasetId) {
      initializeSample(datasetId, listValidAnnotationFields);
    }
  }, [datasetId]);

  return {
    refresh,
    resolved: resolvedMap[datasetId] ?? false,
    validFields: validFieldsMap[datasetId] ?? [],
  };
};
