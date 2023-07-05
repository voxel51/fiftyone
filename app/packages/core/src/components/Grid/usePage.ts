import { Get } from "@fiftyone/flashlight/src/state";
import { zoomAspectRatio } from "@fiftyone/looker";
import { Lookers, LookerStore, ModalSampleData } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useErrorHandler } from "react-error-boundary";
import { useRecoilCallback } from "recoil";
import { pageParameters } from "./recoil";

const PAGE_SIZE = 20;

const usePage = (modal: boolean, store: LookerStore<Lookers>): Get<number> => {
  const handleError = useErrorHandler();
  return useRecoilCallback(
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
              page_length: PAGE_SIZE,
            }
          );
          const offset = (page - 1) * PAGE_SIZE;
          const itemData: ModalSampleData[] = results.map((result, i) => {
            const data = {
              sample: result.sample,
              aspectRatio: result.aspect_ratio,
              frameRate: result.frame_rate,
              frameNumber: result.sample.frame_number,
              urls: Object.fromEntries(
                result.urls.map(({ field, url }) => [field, url])
              ),
            };

            store.samples.set(result.sample._id, data);
            store.indices.set(offset + i, result.sample._id);

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
  );
};

export default usePage;
