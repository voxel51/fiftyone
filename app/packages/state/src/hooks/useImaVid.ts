import { ImaVidFramesController } from "@fiftyone/looker/src/lookers/imavid/controller";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Stage } from "@fiftyone/utilities";
import LRUCache from "lru-cache";
import { RefObject, useCallback, useEffect } from "react";
import { useRelayEnvironment } from "react-relay";
import { selectorFamily, useRecoilCallback, useRecoilValue } from "recoil";
import { Subscription, fetchQuery } from "relay-runtime";
import { shouldRenderImaVidLooker } from "../recoil";

const BUFFER_SIZE = 100;

type SampleId = string;
type SampleResponse =
  foq.paginateSamplesQuery$data["samples"]["edges"][number]["node"];
type PartitionSampleId = string;

export type ImaVidStore = {
  [partitionSampleId: string]: FrameSamples;
};

export class FrameSamples {
  public readonly samples: LRUCache<SampleId, SampleResponse>;
  public readonly indices: Map<string, string>;

  constructor() {
    this.samples = new LRUCache<SampleId, SampleResponse>({
      max: 500,
    });

    this.indices = new Map<string, string>();
  }

  reset() {
    this.indices.clear();
    this.samples.reset();
  }
}

const store = new LRUCache<PartitionSampleId, FrameSamples>({
  max: 20,
  dispose: (_partitionSampleId, sampleFrames) => {
    sampleFrames.reset();
  },
});

const dynamicGroupPageSelector = selectorFamily<
  (
    page: number,
    pageSize: number
  ) => {
    filter: Record<string, never>;
    after: string;
    count: number;
    dataset: string;
    view: Stage[];
  },
  string
>({
  key: "paginateDynamicGroupVariables",
  get:
    (groupByValue) =>
    ({ get }) => {
      const params = {
        dataset: get(fos.datasetName),
        view: get(
          fos.dynamicGroupViewQuery({ groupByFieldValueExplicit: groupByValue })
        ),
      };
      return (page: number, pageSize: number) => {
        return {
          ...params,
          filter: {},
          after: page ? String(page * pageSize - 1) : null,
          count: pageSize,
        };
      };
    },
});

let subscription: Subscription;

const useImaVid = (
  posterSampleRef: RefObject<fos.ModalSample["sample"]["sample"] | null>
) => {
  const shouldRenderImaVidLooker_ = useRecoilValue(shouldRenderImaVidLooker);
  const { groupBy, orderBy } = useRecoilValue(fos.dynamicGroupParameters);

  const environment = useRelayEnvironment();

  useEffect(() => {
    return () => {
      if (!subscription?.closed) {
        try {
          subscription.unsubscribe();
        } catch (e) {
          console.warn(e);
        }
      }
    };
  }, []);

  const fetchMore = useRecoilCallback(
    ({ snapshot }) =>
      async (cursor: number, limit = BUFFER_SIZE) => {
        const posterSampleId = posterSampleRef.current?._id as string;

        if (!posterSampleId) {
          throw new Error("sample not found");
        }
        const groupByFieldValue = posterSampleRef.current[
          fos.getSanitizedGroupByExpression(groupBy)
        ] as string;
        const page = snapshot.getLoadable(
          dynamicGroupPageSelector(groupByFieldValue)
        ).contents;

        const variables = page(cursor, limit);

        return new Promise<void>((resolve, _reject) => {
          // do a gql query here, get samples, update store
          subscription = fetchQuery<foq.paginateSamplesQuery>(
            environment,
            foq.paginateSamples,
            variables
          ).subscribe({
            next: (data) => {
              if (data?.samples?.edges?.length) {
                // update store
                for (const { node } of data.samples.edges) {
                  if (!node) {
                    continue;
                  }

                  if (node.__typename !== "ImageSample") {
                    throw new Error("only image samples supported");
                  }

                  const nodeSampleId = node.sample["_id"] as string;
                  const frameNumber = node.sample[orderBy];

                  store
                    .get(posterSampleId)
                    .samples.set(node.sample["_id"], node);
                  store
                    .get(posterSampleId)
                    .indices.set(frameNumber, nodeSampleId);
                }
              }
              resolve();
            },
          });
        });
      },
    [environment, store, groupBy, orderBy]
  );

  const getImaVidController = useCallback(() => {
    if (!shouldRenderImaVidLooker_) {
      return null;
    }

    const controller = new ImaVidFramesController(
      posterSampleRef,
      store,
      fetchMore
    );
    return controller;
  }, [shouldRenderImaVidLooker_, fetchMore, posterSampleRef]);

  return getImaVidController;
};

export default useImaVid;
