import { FlashlightConfig } from "@fiftyone/flashlight";
import { zoomAspectRatio } from "@fiftyone/looker";
import * as foq from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useState } from "react";
import { VariablesOf, fetchQuery, useRelayEnvironment } from "react-relay";
import { RecoilValueReadOnly, selector, useRecoilValue } from "recoil";

const PAGE_SIZE = 20;

const processSamplePageData = (
  offset: number,
  store: fos.LookerStore<fos.Lookers>,
  data: fos.ResponseFrom<foq.paginateSamplesQuery>,
  zoom?: boolean
) => {
  return data.samples.edges.map((edge, i) => {
    if (edge.node.__typename === "%other") {
      throw new Error("unexpected sample type");
    }

    console.log(offset);
    store.samples.set(edge.node.id, edge.node as fos.ModalSample);
    store.indices.set(offset + i, edge.node.id);

    return {
      aspectRatio: zoom
        ? zoomAspectRatio(edge.node.sample, edge.node.aspectRatio)
        : edge.node.aspectRatio,
      id: edge.node.id,
    };
  });
};

const defaultZoom = selector({
  key: "defaultZoomCallback",
  get: () => async () => false,
});

const useFlashlightPager = (
  store: fos.LookerStore<fos.Lookers>,
  pageSelector: RecoilValueReadOnly<
    (
      page: number,
      pageSize: number
    ) => Promise<VariablesOf<foq.paginateSamplesQuery>>
  >,
  zoomSelector?: RecoilValueReadOnly<() => Promise<boolean>>
): [boolean, FlashlightConfig<number>["get"]] => {
  const environment = useRelayEnvironment();
  const page = useRecoilValue(pageSelector);
  const zoom = useRecoilValue(zoomSelector || defaultZoom);
  const [empty, setEmpty] = useState(false);

  return [
    empty,
    async (pageNumber) => {
      const variables = await page(pageNumber, PAGE_SIZE);
      const zoomValue = await zoom();
      return new Promise((resolve) => {
        const subscription = fetchQuery<foq.paginateSamplesQuery>(
          environment,
          foq.paginateSamples,
          variables
        ).subscribe({
          next: (data) => {
            const items = processSamplePageData(
              pageNumber * PAGE_SIZE,
              store,
              data,
              zoomValue
            );

            subscription.unsubscribe();
            if (!pageNumber && !items.length) {
              setEmpty(true);
            }
            resolve({
              items,
              nextRequestKey: data.samples.pageInfo.hasNextPage
                ? pageNumber + 1
                : null,
            });
          },
        });
      });
    },
  ];
};

export default useFlashlightPager;
