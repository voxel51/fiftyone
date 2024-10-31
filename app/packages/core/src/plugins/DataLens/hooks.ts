import {
  LensConfig,
  ListLensConfigsRequest,
  ListLensConfigsResponse,
  OperatorResponse,
} from "./models";
import { Dispatch, useCallback, useEffect, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";

/**
 * Hook which fetches the list of datasets available to the current user.
 */
export const useDatasets = (): { datasets: string[] } => {
  const [datasets, setDatasets] = useState<string[]>([]);

  const listDatasetsOperator = useOperatorExecutor(
    "@voxel51/operators/list_datasets"
  );

  // Load datasets on initial render.
  useEffect(() => {
    const callback = (response: OperatorResponse<{ datasets?: string[] }>) => {
      if (response.result.datasets) {
        setDatasets(
          response.result.datasets.sort((a, b) => a.localeCompare(b))
        );
      }
    };

    const requestParams = {};

    listDatasetsOperator.execute(requestParams, { callback });
  }, []);

  return {
    datasets,
  };
};

/**
 * Hook which fetches the list of available Data Lens configurations.
 */
export const useLensConfigs = (): {
  lensConfigs: LensConfig[];
  setLensConfigs: Dispatch<React.SetStateAction<LensConfig[]>>;
  error?: string;
  clearError: () => void;
} => {
  const [lensConfigs, setLensConfigs] = useState<LensConfig[]>([]);
  const [error, setError] = useState(null);

  const listConfigsOperator = useOperatorExecutor(
    "@voxel51/operators/lens_list_lens_configs"
  );

  // Load configs on initial render
  useEffect(() => {
    const request: ListLensConfigsRequest = {};

    const callback = (response: OperatorResponse<ListLensConfigsResponse>) => {
      if (!(response.error || response.result?.error)) {
        const configs = response.result?.configs ?? [];
        configs.sort((a, b) => a.name.localeCompare(b.name));
        setLensConfigs(configs);
      } else {
        setError(response.error || response.result?.error);
      }
    };

    listConfigsOperator.execute(request, { callback });
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    lensConfigs,
    setLensConfigs,
    error,
    clearError,
  };
};
