import * as recoil from "recoil";
import * as fos from "..";

export interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
    sampleId: string;
    instanceId?: string;
    instanceName?: string;
    isShiftPressed?: boolean;
  };
}

export function useOnSelectLabel() {
  return recoil.useRecoilCallback(
    ({ set, snapshot }) =>
      async ({
        detail: {
          id,
          field,
          frameNumber,
          sampleId,
          instanceId,
          instanceName,
          isShiftPressed,
        },
      }: SelectEvent) => {
        if (isShiftPressed) {
          document.dispatchEvent(
            new CustomEvent("newLabelToggled", {
              detail: {
                isShiftPressed,
                sourceInstanceId: instanceId,
                sourceInstanceName: instanceName,
                sourceSampleId: sampleId,
                sourceLabelId: id,
              },
            })
          );
          return;
        }

        const labels = { ...(await snapshot.getPromise(fos.selectedLabelMap)) };

        let isLabelRemoved = false;
        if (labels[id]) {
          delete labels[id];
          isLabelRemoved = true;
        } else {
          labels[id] = {
            field,
            sampleId,
            frameNumber,
            instanceId,
            instanceName,
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
