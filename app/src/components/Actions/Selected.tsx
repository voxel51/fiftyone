import React from "react";
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
  const props = useHighlightHover(disabled, false);
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

const getGridActions = (close: () => void) => {
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
    return get(labelAtoms.modalLabels).filter(
      ({ frame_number }) => typeof frame_number !== "number"
    );
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

const visibleModalFrameLabelIds = selector<Set<string>>({
  key: "visibleModalFrameLabelIds",
  get: ({ get }) => {
    return new Set(
      get(labelAtoms.modalLabels)
        .filter(({ frame_number }) => typeof frame_number === "number")
        .map(({ label_id }) => label_id)
    );
  },
});

const visibleModalCurrentFrameLabelIds = selectorFamily<Set<string>, number>({
  key: "visibleModalCurrentFrameLabelIds",
  get: (frameNumber) => ({ get }) => {
    return new Set(
      get(labelAtoms.modalLabels)
        .filter(({ frame_number }) => frame_number === frameNumber)
        .map(({ label_id }) => label_id)
    );
  },
});

const toLabelMap = (labels: atoms.SelectedLabel[]) =>
  Object.fromEntries(labels.map(({ label_id, ...rest }) => [label_id, rest]));

const useSelectVisible = () => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabels);
    const visible = await snapshot.getPromise(visibleModalSampleLabels);
    set(selectors.selectedLabels, {
      ...selected,
      ...toLabelMap(visible),
    });
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

const useHideOthers = () => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(selectors.selectedLabelIds);
    const visible = await snapshot.getPromise(visibleModalSampleLabels);
    const hidden = await snapshot.getPromise(atoms.hiddenLabels);
    set(atoms.hiddenLabels, {
      ...hidden,
      ...toLabelMap(visible.filter(({ label_id }) => !selected.has(label_id))),
    });
  });
};

const hasSetDiff = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => !b.has(e))).size > 0;

const getModalActions = (frameNumberRef, close) => {
  const selectedLabels = useRecoilValue(selectors.selectedLabelIds);
  const visibleSampleLabels = useRecoilValue(visibleModalSampleLabelIds);
  const closeAndCall = (useCallback) => {
    const callback = useCallback();
    return () => {
      close();
      callback();
    };
  };

  return [
    {
      text: "Select all (current sample)",
      disabled: hasSetDiff(visibleSampleLabels, selectedLabels),
      onClick: closeAndCall(useSelectVisible),
    },
    {
      text: "Clear selection",
      disabled: hasSetDiff(selectedLabels, visibleSampleLabels),
      onClick: closeAndCall(useClearSelectedLabels),
    },
    {
      text: "Hide selected",
      disabled: selectedLabels.size > 0,
      onClick: closeAndCall(useHideSelected),
    },
    {
      text: "Hide others (current sample)",
      disabled: hasSetDiff(visibleSampleLabels, selectedLabels),
      onClick: closeAndCall(useHideOthers),
    },
  ].filter(({ disabled }) => !disabled);
};

const SelectionActions = ({ modal, close, frameNumberRef, bounds }) => {
  const actions = modal
    ? getModalActions(frameNumberRef, close)
    : getGridActions(close);

  return (
    <Popout modal={modal} bounds={bounds}>
      {actions.map((props, i) => (
        <ActionOption {...props} key={i} />
      ))}
    </Popout>
  );
};

export default React.memo(SelectionActions);
