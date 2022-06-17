import { Render } from "@fiftyone/flashlight";
export const makeFlashlightLookerRenderer: (
  store,
  onSelect: (id: string) => void,
  onError: (error: Error) => void
) => Render = (store, onSelect, onError) => {
  return (id, element, dimensions, soft, hide) => {
    try {
      const result = store.samples.get(id);

      if (store.lookers.has(id)) {
        const looker = store.lookers.get(id);
        hide ? looker.disable() : looker.attach(element, dimensions);

        return;
      }

      if (!soft) {
        const looker = lookerGeneratorRef.current(result);
        looker.addEventListener(
          "selectthumbnail",
          ({ detail }: { detail: string }) => onSelect(detail)
        );

        store.lookers.set(id, looker);
        looker.attach(element, dimensions);
      }
    } catch (error) {
      onError(error);
    }
  };
};

export const makeFlahlightLookerGetter = () => {
  try {
    const { results, more } = await getFetchFunction()("POST", "/samples", {
      ...paramsRef.current,
      page,
    });

    const itemData = results.map((result) => {
      const data: atoms.SampleData = {
        sample: result.sample,
        dimensions: [result.width, result.height],
        frameRate: result.frameRate,
        frameNumber: result.sample.frameNumber,
        url: result.url,
      };

      store.samples.set(result.sample._id, data);
      store.indices.set(nextIndex, result.sample._id);
      nextIndex++;

      return data;
    });

    const items = itemData.map((data) => {
      return {
        id: data.sample._id,
        aspectRatio: aspectRatioGenerator.current(data),
      };
    });

    return {
      items,
      nextRequestKey: more ? page + 1 : null,
    };
  } catch (error) {
    handleError(error);
  }
};
