import { OperatorConfig, useOperatorExecutor } from "@fiftyone/operators";
import { getLocalOrRemoteOperator } from "@fiftyone/operators/src/operators";
import Spotlight, { ID } from "@fiftyone/spotlight";
import type { Sample } from "@fiftyone/state";
import {
  datasetName,
  Lookers,
  useCreateLooker,
  useDeferrer,
  useLookerOptions as fosUseLookerOptions,
} from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import { useAtom } from "jotai";
import { Dispatch, useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { v4 as uuid } from "uuid";
import {
  LensConfig,
  LensSample,
  ListLensConfigsRequest,
  ListLensConfigsResponse,
  OperatorResponse,
} from "./models";
import { checkedFieldsAtom } from "./state";
import { findFields, formatSchema } from "./utils";

/**
 * Hook which provides the active dataset.
 */
export const useActiveDataset = () => {
  const activeDataset = useRecoilValue(datasetName);
  return { activeDataset };
};

/**
 * Hook which fetches the list of datasets available to the current user.
 */
export const useDatasets = (): {
  datasets: string[];
  activeDataset: string;
} => {
  const { activeDataset } = useActiveDataset();
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
    activeDataset,
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
    "@voxel51/panels/lens_list_lens_configs"
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

/**
 * Hook which builds looker options customized for the provided samples.
 */
const useLookerOptions = ({ samples }: { samples: LensSample[] }) => {
  // Use the same looker options as the Grid as a starting point.
  const baseOpts = fosUseLookerOptions(false);

  const [checkedFields, setCheckedFields] = useAtom(checkedFieldsAtom);

  const labelFields = useMemo(() => {
    // Detect presence of labels
    const labelFields = new Set<string>();
    samples.forEach((sample) => {
      for (let key of Object.keys(sample)) {
        if (sample[key] instanceof Object) {
          // If this sample field has a '_cls' attribute, then
          //   we assume this is a label.
          if (Object.keys(sample[key]).find((k) => k === "_cls")) {
            labelFields.add(key);
          }
        }
      }
    });
    return labelFields;
  }, [samples]);

  useEffect(() => {
    setCheckedFields(Array.from(labelFields));
  }, [labelFields]);

  return useMemo(() => {
    return {
      ...baseOpts,
      filter: () => true,
      activePaths: checkedFields,
    };
  }, [checkedFields, baseOpts]);
};

/**
 * Hook which generates a looker-compatible field schema based on one generated
 * by the SDK.
 */
export const useSampleSchemaGenerator = ({
  baseSchema,
}: {
  baseSchema: { [k: string]: any };
}) => {
  return useMemo(() => {
    const formattedSchema: { [k: string]: any } = {};
    for (const k of Object.keys(baseSchema)) {
      if (baseSchema[k] instanceof Object) {
        // Convert top-level objects
        formattedSchema[k] = formatSchema(baseSchema[k]);
        formattedSchema[k]["path"] = baseSchema[k]["name"];
      } else {
        // Copy top-level scalars
        formattedSchema[k] = baseSchema[k];
      }
    }

    return formattedSchema as Schema;
  }, [baseSchema]);
};

/**
 * URLs type encapsulated in other types.
 */
type SampleUrls = {
  [field: string]: string;
};

/**
 * Sample metadata expected by the Spotlight.
 */
type SampleMetadata = {
  key: number;
  aspectRatio: number;
  id: {
    description: string;
  };
  data: {
    id: string;
    sample: LensSample & {
      _id: string;
    };
    urls: SampleUrls;
  };
};

/**
 * Page of samples used by the Spotlight.
 */
type SamplePage = {
  items: SampleMetadata[];
  next: number | null;
  previous: number | null;
};

/**
 * Sample metadata expected by the Looker.
 */
type SampleStoreEntry = {
  aspectRatio: number;
  id: string;
  sample: LensSample;
  urls: SampleUrls;
};

const sampleMediaFields = ["filepath"];

/**
 * Hook to repaint lookers when the options change.
 */
const useRefresh = (
  options: ReturnType<typeof useLookerOptions>,
  store: WeakMap<ID, Lookers>,
  spotlight?: Spotlight<number, Sample>
) => {
  const { init, deferred } = useDeferrer();

  useEffect(() => {
    deferred(() => {
      spotlight?.updateItems((id) => {
        const instance = store.get(id);
        if (!instance) {
          return;
        }

        instance.updateOptions({
          ...options,
        });
      });
    });
  }, [deferred, options, spotlight, store]);

  useEffect(() => {
    return spotlight ? init() : undefined;
  }, [spotlight, init]);
};

/**
 * Hook which manages a spotlight instance used to render samples.
 * @param samples Samples to render
 * @param sampleSchema Sample schema as returned by SDK
 * @param resizing If true, in a resizing event.
 * @param minZoomLevel Minimum zoom level
 * @param maxZoomLevel Maximum zoom level
 * @param zoom Current zoom level
 */
export const useSpotlight = ({
  samples,
  sampleSchema,
  resizing,
  minZoomLevel,
  maxZoomLevel,
  zoom,
}: {
  samples: LensSample[];
  sampleSchema: Schema;
  resizing: boolean;
  minZoomLevel: number;
  maxZoomLevel: number;
  zoom: number;
}) => {
  const lookerStore = useMemo(() => new WeakMap<ID, Lookers>(), []);
  const sampleStore = useMemo(() => new WeakMap<ID, SampleStoreEntry>(), []);

  const lookerOpts = useLookerOptions({ samples });

  const createLooker = useCreateLooker(
    false,
    true,
    lookerOpts,
    undefined,
    undefined,
    sampleSchema
  );

  const buildUrls = useCallback(
    (sampleData: any) => findFields(sampleMediaFields, sampleData),
    []
  );

  const spotlight = useMemo(() => {
    if (resizing) {
      return;
    }

    return new Spotlight<number, Sample>({
      key: 0, // initial page index
      scrollbar: true,
      rowAspectRatioThreshold: (width: number) => {
        return Math.max(minZoomLevel, maxZoomLevel - zoom);
      },
      get: (page: number): Promise<SamplePage> => {
        const pageSize = 20;
        const samplePage = samples.slice(
          page * pageSize,
          (page + 1) * pageSize
        );

        const getAspectRatio = (s: LensSample): number => {
          if (s.metadata?.width > 0 && s.metadata?.height > 0) {
            return s.metadata.width / s.metadata.height;
          }

          return 1;
        };

        const mappedSamples: SampleMetadata[] = samplePage.map((s) => {
          const id = uuid();
          const urls = buildUrls(s);

          return {
            key: page,
            aspectRatio: getAspectRatio(s),
            id: {
              description: id,
            },
            data: {
              id,
              sample: {
                _id: id,
                ...s,
              },
              urls,
            },
          };
        });

        // Store these samples in the sample store; this is where the renderer will pull from
        mappedSamples.forEach((s) => {
          const storeElement: SampleStoreEntry = {
            aspectRatio: s.aspectRatio,
            id: s.id.description,
            sample: s.data.sample,
            urls: s.data.urls,
          };

          sampleStore.set(s.id, storeElement);
        });

        return Promise.resolve({
          items: mappedSamples,
          next: (page + 1) * pageSize < samples.length ? page + 1 : null,
          previous: page > 0 ? page - 1 : null,
        });
      },
      render: (
        id: ID,
        element: HTMLDivElement,
        dimensions: [number, number],
        zooming: boolean
      ) => {
        if (!lookerStore.has(id) && !zooming) {
          const sample = sampleStore.get(id);

          if (!(createLooker.current && sample)) {
            throw new Error(
              `createLooker=${!!createLooker.current}, sample=${JSON.stringify(
                sample
              )}`
            );
          }

          lookerStore.set(id, createLooker.current({ ...sample, symbol: id }));
        }

        lookerStore.get(id)?.attach(element, dimensions);
      },
      spacing: 20,
      destroy: (id: ID) => {
        lookerStore.get(id)?.destroy();
        lookerStore.delete(id);
      },
    });
  }, [lookerStore, sampleStore, createLooker, samples, resizing, zoom]);

  useRefresh(lookerOpts, lookerStore, spotlight);

  return spotlight;
};

/**
 * Hook which manages a configuration object for the provided operator.
 *
 * @param operatorUri Operator URI
 */
export const useOperatorConfig = ({
  operatorUri,
}: {
  operatorUri: string;
}): OperatorConfig | null => {
  const { operator } = useMemo(
    () => getLocalOrRemoteOperator(operatorUri),
    [operatorUri]
  );

  return operator.config;
};
