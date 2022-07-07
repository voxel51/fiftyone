import { Get } from "@fiftyone/flashlight/src/state";
import { zoomAspectRatio } from "@fiftyone/looker";
import { getFetchFunction } from "@fiftyone/utilities";
import { MutableRefObject, useRef } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback } from "recoil";
import { Lookers, LookerStore } from "../../hooks/useLookerStore";
import { SampleData } from "../../recoil/atoms";
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
                dimensions: [result.width, result.height],
                frameRate: result.frameRate,
                frameNumber: result.sample.frameNumber,
                url: result.url,
              };

              store.samples.set(result.sample._id, data);
              store.indices.set(next.current, result.sample._id);
              next.current++;

              return data;
            });

            const items = itemData.map(
              ({ sample, dimensions: [width, height] }) => {
                const aspectRatio = width / height;
                return {
                  id: sample._id,
                  aspectRatio: zoom
                    ? zoomAspectRatio(sample, aspectRatio)
                    : aspectRatio,
                };
              }
            );

            return {
              items,
              nextRequestKey: more ? page + 1 : undefined,
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
