import React, { MutableRefObject } from "react";
import {
  RecoilValueReadOnly,
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilValue,
} from "recoil";

import Popout from "./Popout";
import { HoverItemDiv, useHighlightHover } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import * as labelAtoms from "../Filters/LabelFieldFilters.state";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";

type ActionOptionProps = {
  onClick: () => void;
  text: string;
  title?: string;
  disabled?: boolean;
};

const ActionOption = ({
  onClick,
  text,
  title,
  disabled,
}: ActionOptionProps) => {
  const props = useHighlightHover(disabled);
  if (disabled) {
    return null;
  }
  return (
    <HoverItemDiv
      title={title ? title : text}
      onClick={disabled ? null : onClick}
      {...props}
    >
      {text}
    </HoverItemDiv>
  );
};

const useGridActions = (close: () => void) => {
  const clearSelection = useRecoilCallback(
    ({ snapshot, set, reset }) => async () => {
      const [oldSelected, state] = await Promise.all([
        snapshot.getPromise(atoms.selectedSamples),
        snapshot.getPromise(atoms.stateDescription),
      ]);
      oldSelected.forEach((s) => reset(atoms.isSelectedSample(s)));
      const newState = JSON.parse(JSON.stringify(state));
      newState.selected = [];
      set(atoms.stateDescription, newState);
      reset(atoms.selectedSamples);
      socket.send(packageMessage("clear_selection", {}));
      close();
    },
    [close]
  );
  const addStage = useRecoilCallback(({ snapshot, set }) => async (name) => {
    close();
    const state = await snapshot.getPromise(atoms.stateDescription);
    const newState = JSON.parse(JSON.stringify(state));
    const samples = await snapshot.getPromise(atoms.selectedSamples);
    const newView = newState.view || [];
    newView.push({
      _cls: `fiftyone.core.stages.${name}`,
      kwargs: [["sample_ids", Array.from(samples)]],
    });
    newState.view = newView;
    newState.selected = [];
    socket.send(packageMessage("update", { state: newState }));
    set(atoms.stateDescription, newState);
  });

  return [
    {
      text: "Clear selected samples",
      title: "Deselect all selected samples",
      onClick: clearSelection,
    },
    {
      text: "Only show selected samples",
      title: "Hide all other samples",
      onClick: () => addStage("Select"),
    },
    {
      text: "Hide selected samples",
      title: "Show only unselected samples",
      onClick: () => addStage("Exclude"),
    },
  ];
};

const visibleModalSampleLabels = selector<atoms.SelectedLabel[]>({
  key: "visibleModalSampleLabels",
  get: ({ get }) => {
    return get(labelAtoms.modalLabels);
  },
});

const visibleModalSampleLabelIds = selector<Set<string>>({
  key: "visibleModalSampleLabelIds",
  get: ({ get }) => {
    return new Set(
      get(visibleModalSampleLabels).map(({ label_id }) => label_id)
    );
  },
});

const visibleModalCurrentFrameLabels = selectorFamily<
  atoms.SelectedLabel[],
  number
>({
  key: "visibleModalCurrentFrameLabels",
  get: (frameNumber) => ({ get }) => {
    return get(labelAtoms.modalLabels).filter(
      ({ frame_number }) => frame_number === frameNumber
    );
  },
});

const visibleModalCurrentFrameLabelIds = selectorFamily<Set<string>, number>({
  key: "visibleModalCurrentFrameLabelIds",
  get: (frameNumber) => ({ get }) => {
    return new Set(
      get(visibleModalCurrentFrameLabels(frameNumber)).map(
        ({ label_id }) => label_id
      )
    );
  },
});

const toLabelMap = (labels: atoms.SelectedLabel[]) =>
  Object.fromEntries(labels.map(({ label_id, ...rest }) => [label_id, rest]));

const useSelectVisible = (
  visibleAtom: RecoilValueReadOnly<atoms.SelectedLabel[]>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    const visible = await snapshot.getPromise(visibleAtom);
    set(selectors.selectedLabels, {
      ...selected,
      ...toLabelMap(visible),
    });
  });
};

const useUnselectVisible = (
  visibleIdsAtom: RecoilValueReadOnly<Set<string>>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    const visibleIds = await snapshot.getPromise(visibleIdsAtom);

    const filtered = Object.entries(selected).filter(
      ([label_id]) => !visibleIds.has(label_id)
    );
    set(selectors.selectedLabels, Object.fromEntries(filtered));
  });
};

const useClearSelectedLabels = () => {
  return useRecoilCallback(({ set }) => async () =>
    set(selectors.selectedLabels, {})
  );
};

const useHideSelected = () => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    const hidden = await snapshot.getPromise(atoms.hiddenLabels);
    set(selectors.selectedLabels, {});
    set(atoms.hiddenLabels, { ...hidden, ...selected });
  });
};

const useHideOthers = (
  visibleAtom: RecoilValueReadOnly<atoms.SelectedLabel[]>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabelIds);
    const visible = await snapshot.getPromise(visibleAtom);
    const hidden = await snapshot.getPromise(atoms.hiddenLabels);
    set(atoms.hiddenLabels, {
      ...hidden,
      ...toLabelMap(visible.filter(({ label_id }) => !selected.has(label_id))),
    });
  });
};

const hasSetDiff = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => !b.has(e))).size > 0;

const hasSetInt = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => b.has(e))).size > 0;

const useModalActions = (frameNumberRef, close) => {
  const selectedLabels = useRecoilValue(selectors.selectedLabelIds);
  const visibleSampleLabels = useRecoilValue(visibleModalSampleLabelIds);
  const visibleFrameLabels = useRecoilValue(
    visibleModalCurrentFrameLabelIds(frameNumberRef.current)
  );
  const isVideo = useRecoilValue(selectors.isVideoDataset);
  const closeAndCall = (callback) => {
    return React.useCallback(() => {
      close();
      callback();
    }, []);
  };

  const hasVisibleUnselected = hasSetDiff(visibleSampleLabels, selectedLabels);
  const hasFrameVisibleUnselected = hasSetDiff(
    visibleFrameLabels,
    selectedLabels
  );
  const hasVisibleSelection = hasSetInt(selectedLabels, visibleSampleLabels);

  return [
    {
      text: "Select visible (current sample)",
      disabled: !hasVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(visibleModalSampleLabels)),
    },
    {
      text: "Unselect visible (current sample)",
      disabled: !hasVisibleSelection,
      onClick: closeAndCall(useUnselectVisible(visibleModalSampleLabelIds)),
    },
    isVideo && {
      text: "Select visible (current frame)",
      disabled: !hasFrameVisibleUnselected,
      onClick: closeAndCall(
        useSelectVisible(visibleModalCurrentFrameLabels(frameNumberRef.current))
      ),
    },
    isVideo && {
      text: "Unselect visible (current frame)",
      disabled: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(
          visibleModalCurrentFrameLabelIds(frameNumberRef.current)
        )
      ),
    },
    {
      text: "Clear selection",
      disabled: !selectedLabels.size,
      onClick: closeAndCall(useClearSelectedLabels()),
    },
    {
      text: "Hide selected",
      disabled: !selectedLabels.size,
      onClick: closeAndCall(useHideSelected()),
    },
    {
      text: "Hide unselected (current sample)",
      disabled: !hasVisibleUnselected,
      onClick: closeAndCall(useHideOthers(visibleModalSampleLabels)),
    },
    isVideo && {
      text: "Hide unselected (current frame)",
      disabled: !hasFrameVisibleUnselected,
      onClick: closeAndCall(
        useHideOthers(visibleModalCurrentFrameLabels(frameNumberRef.current))
      ),
    },
  ].filter(Boolean);
};

interface SelectionActionsProps {
  modal: boolean;
  close: () => void;
  playerRef?: any;
  frameNumberRef: MutableRefObject<number>;
  bounds: any;
}

const SelectionActions = ({
  modal,
  close,
  playerRef,
  frameNumberRef,
  bounds,
}: SelectionActionsProps) => {
  playerRef?.current?.pause && playerRef.current.pause();
  const actions = modal
    ? useModalActions(frameNumberRef, close)
    : useGridActions(close);

  return (
    <Popout modal={modal} bounds={bounds}>
      {actions.map((props, i) => (
        <ActionOption {...props} key={i} />
      ))}
    </Popout>
  );
};

export default React.memo(SelectionActions);
