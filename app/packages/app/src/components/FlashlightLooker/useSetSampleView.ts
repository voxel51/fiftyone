import { FlashlightConfig } from "@fiftyone/flashlight";

import { CallbackInterface, useRecoilCallback } from "recoil";

import * as atoms from "../../recoil/atoms";

import type { LookerStore, Lookers } from "./createStore";

export default <T extends Lookers>(
  store: LookerStore<T>,
  callback?: (callbackInteface: CallbackInterface) => void
) => {
  return useRecoilCallback<
    Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>,
    ReturnType<NonNullable<FlashlightConfig<number>["onItemClick"]>>
  >(
    (callbackInterface) => async (next, sampleId, itemIndexMap) => {
      const clickedIndex = itemIndexMap[sampleId];

      const getIndex = (index) => {
        const promise = store.indices.has(index)
          ? Promise.resolve(store.samples.get(store.indices.get(index)))
          : next().then(() => {
              return store.indices.has(index)
                ? store.samples.get(store.indices.get(index))
                : null;
            });

        promise
          ? promise.then((sample) => {
              sample
                ? callbackInterface.set(atoms.modal, {
                    ...sample,
                    index,
                    getIndex,
                  })
                : null;
            })
          : null;
      };

      const sample = store.samples.get(sampleId);
      sample &&
        callbackInterface.set(atoms.modal, {
          ...sample,
          index: clickedIndex,
          getIndex,
        });

      callback && (await callback(callbackInterface));
    },
    [callback, store]
  );
};
