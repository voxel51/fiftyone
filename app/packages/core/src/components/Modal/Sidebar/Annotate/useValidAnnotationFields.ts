import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentDatasetId } from "@fiftyone/state";
import { useSchemaManager } from "./useSchemaManager";

export type UseValidAnnotationFields = {
  refresh: () => void;
  resolved: boolean;
  validFields: string[];
};

export const useValidAnnotationFields = (): UseValidAnnotationFields => {
  const { listValidAnnotationFields } = useSchemaManager();
  const datasetId = useCurrentDatasetId();

  const [validFields, setValidFields] = useState<string[]>([]);
  const [resolved, setResolved] = useState(false);
  const inFlightRef = useRef(false);

  const fetchFields = useCallback(async () => {
    if (!datasetId || inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      const response = await listValidAnnotationFields({});
      setValidFields(response.valid_fields ?? []);
    } catch (err) {
      console.warn("Failed to fetch annotation fields", err);
    } finally {
      inFlightRef.current = false;
      setResolved(true);
    }
  }, [datasetId, listValidAnnotationFields]);

  const refresh = useCallback(() => {
    setValidFields([]);
    setResolved(false);
    fetchFields();
  }, [fetchFields]);

  useEffect(() => {
    setResolved(false);
    fetchFields();
  }, [datasetId]);

  return { refresh, resolved, validFields };
};
