import {
  LabelToggledEvent,
  selectiveRenderingEventBus,
} from "@fiftyone/looker";
import * as recoil from "recoil";
import * as fos from "..";

export interface SelectEvent {
  detail: {
    id: string;
    field: string;
    frameNumber?: number;
    sampleId: string;
    instanceId?: string;
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
          isShiftPressed,
        },
      }: SelectEvent) => {
        if (isShiftPressed) {
          selectiveRenderingEventBus.emit(
            new LabelToggledEvent({
              sourceInstanceId: instanceId,
              sourceSampleId: sampleId,
              sourceLabelId: id,
            })
          );
          return;
        }

        const labels = { ...(await snapshot.getPromise(fos.selectedLabelMap)) };

        if (labels[id]) {
          delete labels[id];
        } else {
          labels[id] = {
            field,
            sampleId,
            frameNumber,
            instanceId,
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
