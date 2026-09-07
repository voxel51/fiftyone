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
    isAltPressed?: boolean;
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
          isAltPressed,
        },
      }: SelectEvent) => {
        if (isShiftPressed) {
          selectiveRenderingEventBus.emit(
            new LabelToggledEvent({
              sourceInstanceId: instanceId,
              sourceSampleId: sampleId,
              sourceLabelId: id,
            }),
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
            type: isAltPressed ? "alt" : "default",
          };
        }
        set(
          fos.selectedLabels,
          Object.entries(labels).map(([labelId, data]) => ({
            ...data,
            labelId,
          })),
        );
      },
    [],
  );
}

/**
 * Read accessors and one mutation primitive for the modal's label selection,
 * living here for the same reason {@link fos.useOnSelectLabel} does: the
 * selection is Recoil state, and surfaces that drive it should not have to
 * import Recoil to do so (see `.recoil-allowlist.txt`).
 */

/** The ids of every currently selected label. */
export const useSelectedLabelIds = (): ReadonlySet<string> =>
  recoil.useRecoilValue(fos.selectedLabelIds);

/** The sample the modal is showing. */
export const useModalSampleId = (): string =>
  recoil.useRecoilValue(fos.modalSampleId);

/** A change to the selection, expressed as labels in and label ids out. */
export interface SelectedLabelsDelta {
  add?: readonly fos.State.SelectedLabel[];
  remove?: readonly string[];
}

/**
 * Apply a delta to the selected labels in one write.
 *
 * Additive by nature — it adds and removes exactly what it is given and leaves
 * the rest alone — which is what lets several independent gestures accumulate
 * into one selection rather than replacing each other.
 *
 * A delta that changes nothing publishes nothing. Callers can be driven by
 * state that also derives FROM this atom (a canvas mirroring the selection
 * back), where republishing an unchanged map would hand every derived selector
 * a fresh identity and kick those observers off again for no reason.
 */
export const useApplySelectedLabelsDelta = () =>
  recoil.useRecoilCallback(
    ({ snapshot, set }) =>
      ({ add = [], remove = [] }: SelectedLabelsDelta) => {
        const labels = {
          ...snapshot.getLoadable(fos.selectedLabelMap).getValue(),
        };

        let changed = false;

        for (const labelId of remove) {
          if (labelId in labels) {
            delete labels[labelId];
            changed = true;
          }
        }

        for (const { labelId, ...label } of add) {
          if (labelId in labels) {
            continue;
          }

          labels[labelId] = label;
          changed = true;
        }

        if (changed) {
          set(fos.selectedLabelMap, labels);
        }
      },
    [],
  );
