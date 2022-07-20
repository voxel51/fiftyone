import * as fos from "..";
import * as recoil from "recoil";

export interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
  };
}

export function useOnSelectLabel() {
  const send = fos.useSetSelectedLabels();
  return recoil.useRecoilTransaction_UNSTABLE(
    ({ get, set }) =>
      ({ detail: { id, field, frameNumber } }: SelectEvent) => {
        const { sample } = get(fos.modal);
        let labels = {
          ...get(fos.selectedLabels),
        };
        if (labels[id]) {
          delete labels[id];
        } else {
          labels[id] = {
            field,
            sampleId: sample._id,
            frameNumber,
          };
        }

        set(fos.selectedLabels, labels);
        send(
          Object.entries(labels).map(([labelId, data]) => ({
            ...data,
            labelId,
          }))
        );
      },
    []
  );
}
