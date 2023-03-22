import * as recoil from "recoil";
import * as fos from "..";

export interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
    sampleId: string;
  };
}

export function useOnSelectLabel() {
  return recoil.useRecoilCallback(
    ({ set, snapshot }) =>
      async ({ detail: { id, field, frameNumber, sampleId } }: SelectEvent) => {
        const labels = { ...(await snapshot.getPromise(fos.selectedLabelMap)) };
        if (labels[id]) {
          delete labels[id];
        } else {
          labels[id] = {
            field,
            sampleId: sampleId,
            frameNumber,
          };
        }
        set(
          fos.selectedLabels,
          Object.entries(labels).map(([labelId, data]) => ({
            ...data,
            labelId,
          }))
        );
      },
    []
  );
}
