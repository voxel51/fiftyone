import type { Lookers } from "@fiftyone/looker";
import type { State } from "@fiftyone/state";
import * as fos from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type { RecoilValueReadOnly } from "recoil";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { toLabelMap } from "./utils";

export const useClearSelectedLabels = (close) => {
  return useRecoilCallback(
    ({ set }) =>
      async () => {
        set(fos.selectedLabels, []);
        close();
      },
    []
  );
};

export const useClearSampleSelection = (close) => {
  const setSelected = fos.useSetSelected();

  return useCallback(() => {
    setSelected(new Set());
    close();
  }, [close, setSelected]);
};

export const useHideOthers = (
  visibleAtom?: RecoilValueReadOnly<State.SelectedLabel[]>,
  visible?: State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelIds);
    const result = visibleAtom
      ? await snapshot.getPromise(visibleAtom)
      : visible ?? [];
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    set(fos.hiddenLabels, {
      ...hidden,
      ...toLabelMap(result.filter(({ labelId }) => !selected.has(labelId))),
    });
  });
};

export const useHideSelected = () => {
  return useRecoilCallback(({ snapshot, set, reset }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelMap);
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    reset(fos.selectedLabels);
    set(fos.hiddenLabels, { ...hidden, ...selected });
  });
};

export const useSelectVisible = (
  visibleAtom?: RecoilValueReadOnly<fos.State.SelectedLabel[]> | null,
  visible?: fos.State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelMap);

    set(fos.selectedLabelMap, {
      ...selected,
      ...toLabelMap(
        visibleAtom ? await snapshot.getPromise(visibleAtom) : visible || []
      ),
    });
  });
};

export const useVisibleSampleLabels = (
  lookerRef: MutableRefObject<Lookers>
) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const activeLabels = useRecoilValue(fos.activeLabels({}));

  const currentSampleLabels = lookerRef.current
    ? lookerRef.current.getCurrentSampleLabels()
    : [];

  if (isGroup) {
    return activeLabels;
  }

  return currentSampleLabels;
};

export const useUnselectVisible = (
  visibleIdsAtom?: RecoilValueReadOnly<Set<string>>,
  visibleIds?: Set<string>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabels);
    const result = visibleIdsAtom
      ? await snapshot.getPromise(visibleIdsAtom)
      : visibleIds;

    const filtered = Object.entries(selected).filter(
      ([label_id]) => !result?.has(label_id)
    );
    set(fos.selectedLabelMap, Object.fromEntries(filtered));
  });
};
