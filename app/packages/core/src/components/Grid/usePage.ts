import { Get } from "@fiftyone/flashlight/src/state";
import { zoomAspectRatio } from "@fiftyone/looker";
import { Lookers, LookerStore, SampleData } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { MutableRefObject, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback } from "recoil";
import { pageParameters } from "./recoil";

const usePage = (
  modal: boolean,
  store: LookerStore<Lookers>
): [MutableRefObject<number>, Get<number>] => {
  const handleError = useErrorHandler();
  const next = useRef(0);
  return [
    next,
    useRecoilCallback(
      ({ snapshot }) =>
        async (page: number) => {
          try {
            const { zoom, ...params } = await snapshot.getPromise(
              pageParameters(modal)
            );
            const { results, more } = await getFetchFunction()(
              "POST",
              "/samples",
              {
                ...params,
                page,
              }
            );

            const itemData: SampleData[] = results.map((result) => {
              const data: SampleData = {
                sample: result.sample,
                aspectRatio: result.aspect_ratio,
                frameRate: result.frame_rate,
                frameNumber: result.sample.frame_number,
                urls: Object.fromEntries(
                  result.urls.map(({ field, url }) => [field, url])
                ),
              };

              store.samples.set(result.sample._id, data);
              store.indices.set(next.current, result.sample._id);
              next.current++;

              return data;
            });

            const items = itemData.map(({ sample, aspectRatio }) => {
              return {
                id: sample._id,
                aspectRatio: zoom
                  ? zoomAspectRatio(sample, aspectRatio)
                  : aspectRatio,
              };
            });

            return {
              items,
              nextRequestKey: more ? page + 1 : null,
            };
          } catch (error) {
            handleError(error);
            throw error;
          }
        },
      [modal]
    ),
  ];
};

export default usePage;
