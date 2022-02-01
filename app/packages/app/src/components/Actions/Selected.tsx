import React, { MutableRefObject, useLayoutEffect } from "react";
import { RecoilValueReadOnly, useRecoilCallback, useRecoilValue } from "recoil";

import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";

import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import { State } from "../../recoil/types";
import * as viewAtoms from "../../recoil/view";
import socket from "../../shared/connection";
import { useEventHandler } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";

import { ActionOption } from "./Common";
import Popout from "./Popout";

const useClearSampleSelection = (close) => {
  return useRecoilCallback(
    ({ set }) => async () => {
      set(atoms.selectedSamples, new Set());
      socket.send(packageMessage("clear_selection", {}));
      close();
    },
    [close]
  );
};

const useGridActions = (close: () => void) => {
  const elementNames = useRecoilValue(viewAtoms.elementNames);
  const clearSelection = useClearSampleSelection(close);
  const addStage = useRecoilCallback(({ snapshot }) => async (name) => {
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
  });

  return [
    {
      text: `Clear selected ${elementNames.plural}`,
      title: `Deselect all selected ${elementNames.plural}`,
      onClick: clearSelection,
    },
    {
      text: `Only show selected ${elementNames.plural}`,
      title: `Hide all other ${elementNames.plural}`,
      onClick: () => addStage("Select"),
    },
    {
      text: `Hide selected ${elementNames.plural}`,
      title: `Show only unselected ${elementNames.plural}`,
      onClick: () => addStage("Exclude"),
    },
  ];
};

const toLabelMap = (labels: State.SelectedLabel[]): State.SelectedLabelMap =>
  Object.fromEntries(labels.map(({ labelId, ...rest }) => [labelId, rest]));

const useSelectVisible = (
  visibleAtom?: RecoilValueReadOnly<State.SelectedLabel[]>,
  visible?: State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    visible = visibleAtom ? await snapshot.getPromise(visibleAtom) : visible;
    set(selectors.selectedLabels, {
      ...selected,
      ...toLabelMap(visible),
    });
  });
};

const useUnselectVisible = (
  visibleIdsAtom?: RecoilValueReadOnly<Set<string>>,
  visibleIds?: Set<string>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    visibleIds = visibleIdsAtom
      ? await snapshot.getPromise(visibleIdsAtom)
      : visibleIds;

    const filtered = Object.entries(selected).filter(
      ([label_id]) => !visibleIds.has(label_id)
    );
    set(selectors.selectedLabels, Object.fromEntries(filtered));
  });
};

const useClearSelectedLabels = (close) => {
  return useRecoilCallback(
    ({ set }) => async () => {
      set(selectors.selectedLabels, {});
      close();
    },
    []
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
  visibleAtom?: RecoilValueReadOnly<State.SelectedLabel[]>,
  visible?: State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabelIds);
    visible = visibleAtom ? await snapshot.getPromise(visibleAtom) : visible;
    const hidden = await snapshot.getPromise(atoms.hiddenLabels);
    set(atoms.hiddenLabels, {
      ...hidden,
      ...toLabelMap(visible.filter(({ labelId }) => !selected.has(labelId))),
    });
  });
};

const hasSetDiff = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => !b.has(e))).size > 0;

const hasSetInt = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => b.has(e))).size > 0;

const toIds = (labels: State.SelectedLabel[]) =>
  new Set([...labels].map(({ labelId }) => labelId));

const useModalActions = (
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>,
  close
) => {
  const selected = useRecoilValue(atoms.selectedSamples);
  const clearSelection = useClearSampleSelection(close);

  const selectedLabels = useRecoilValue(selectors.selectedLabelIds);
  const visibleSampleLabels = lookerRef.current.getCurrentSampleLabels();
  const isVideo =
    useRecoilValue(selectors.isVideoDataset) &&
    useRecoilValue(viewAtoms.isRootView);
  const visibleFrameLabels =
    lookerRef.current instanceof VideoLooker
      ? lookerRef.current.getCurrentFrameLabels()
      : new Array<State.SelectedLabel>();

  const closeAndCall = (callback) => {
    return React.useCallback(() => {
      close();
      callback();
    }, []);
  };
  const elementNames = useRecoilValue(viewAtoms.elementNames);

  const hasVisibleUnselected = hasSetDiff(
    toIds(visibleSampleLabels),
    selectedLabels
  );
  const hasFrameVisibleUnselected = hasSetDiff(
    toIds(visibleFrameLabels),
    selectedLabels
  );
  const hasVisibleSelection = hasSetInt(
    selectedLabels,
    toIds(visibleSampleLabels)
  );

  return [
    selected.size > 0 && {
      text: `Clear selected ${elementNames.plural}`,
      title: `Deselect all selected ${elementNames.plural}`,
      onClick: clearSelection,
    },
    {
      text: `Select visible (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(null, visibleSampleLabels)),
    },
    {
      text: `Unselect visible (current ${elementNames.singular})`,
      hidden: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(null, toIds(visibleSampleLabels))
      ),
    },
    isVideo && {
      text: "Select visible (current frame)",
      hidden: !hasFrameVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(null, visibleFrameLabels)),
    },
    isVideo && {
      text: "Unselect visible (current frame)",
      hidden: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(null, toIds(visibleFrameLabels))
      ),
    },
    {
      text: "Clear selection",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useClearSelectedLabels(close)),
    },
    {
      text: "Hide selected",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useHideSelected()),
    },
    {
      text: `Hide unselected (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useHideOthers(null, visibleSampleLabels)),
    },
    isVideo && {
      text: "Hide unselected (current frame)",
      hidden: !hasFrameVisibleUnselected,
      onClick: closeAndCall(useHideOthers(null, visibleFrameLabels)),
    },
  ].filter(Boolean);
};

interface SelectionActionsProps {
  modal: boolean;
  close: () => void;
  lookerRef: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>;
  bounds: any;
}

const SelectionActions = ({
  modal,
  close,
  lookerRef,
  bounds,
}: SelectionActionsProps) => {
  useLayoutEffect(() => {
    lookerRef &&
      lookerRef.current instanceof VideoLooker &&
      lookerRef.current.pause &&
      lookerRef.current.pause();
  });
  const actions = modal
    ? useModalActions(lookerRef, close)
    : useGridActions(close);

  lookerRef && useEventHandler(lookerRef.current, "play", close);

  return (
    <Popout modal={modal} bounds={bounds}>
      {actions.map((props, i) => (
        <ActionOption {...props} key={i} />
      ))}
    </Popout>
  );
};

export default React.memo(SelectionActions);
