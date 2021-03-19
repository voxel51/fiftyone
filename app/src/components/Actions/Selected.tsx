import React from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

import Popout from "./Popout";
import { HoverItemDiv, useHighlightHover } from "./utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import socket from "../../shared/connection";
import { packageMessage } from "../../utils/socket";
import { listSampleLabels } from "../../utils/labels";
import * as labelAtoms from "../Filters/LabelFieldFilters.state";
import { useSendMessage } from "../../utils/hooks";
import { update } from "xstate/lib/actionTypes";

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

const addLabelsToSelection = (
  selection: atoms.SelectedLabelMap,
  addition: atoms.SelectedLabel[]
) => {
  return {
    ...selection,
    ...Object.fromEntries(
      addition.map(({ label_id, ...rest }) => [label_id, rest])
    ),
  };
};

const removeMatchingLabelsFromSelection = (
  selection: atoms.SelectedLabelMap,
  filter: atoms.SelectedLabelData
) => {
  const newSelection = { ...selection };
  if (Object.keys(filter).length) {
    for (const [label_id, data] of Object.entries(selection)) {
      if (
        (filter.sample_id === undefined ||
          filter.sample_id === data.sample_id) &&
        (filter.field === undefined || filter.field === data.field) &&
        (filter.frame_number === undefined ||
          filter.frame_number === data.frame_number)
      ) {
        delete newSelection[label_id];
      }
    }
  }
  return newSelection;
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

const _addFrameNumberToLabels = (labels, frame_number) =>
  labels.map((label) => ({ ...label, frame_number }));

const getModalActions = (frameNumberRef, close) => {
  const sample = useRecoilValue(selectors.modalSample);
  const [selectedLabels, setSelectedLabels] = useRecoilState(
    selectors.selectedLabels
  );
  const filter = useRecoilValue(labelAtoms.sampleModalFilter);
  const setHiddenLabels = useSetRecoilState(atoms.hiddenLabels);
  const hiddenLabelIds = useRecoilValue(selectors.hiddenLabelIds);

  const sampleFrameData =
    useRecoilValue(atoms.sampleFrameData(sample._id)) || [];
  const isVideo = useRecoilValue(selectors.mediaType) == "video";
  const frameNumber = isVideo ? frameNumberRef.current : null;

  useSendMessage(
    "set_selected_labels",
    {
      selected_labels: Object.entries(
        selectedLabels
      ).map(([label_id, label]) => ({ label_id, ...label })),
    },
    null,
    [selectedLabels]
  );

  const sampleLabels = isVideo
    ? sampleFrameData
        .map(listSampleLabels)
        .filter((o) => hiddenLabelIds.has(o._id))
        .map((arr, i) => _addFrameNumberToLabels(arr, i + 1))
        .flat()
    : listSampleLabels(filter(sample));
  const frameLabels =
    isVideo && frameNumber && sampleFrameData[frameNumber - 1]
      ? _addFrameNumberToLabels(
          listSampleLabels(
            filter(sampleFrameData[frameNumber - 1], "frames.")
          ).filter((l) => !hiddenLabelIds.has(l._id)),
          frameNumber
        )
      : [];

  const numTotalSelectedObjects = Object.keys(selectedLabels).length;
  const numSampleSelectedObjects = sampleLabels.filter(
    (label) => selectedLabels[label._id]
  ).length;
  const numFrameSelectedObjects = frameLabels.filter(
    (label) => selectedLabels[label._id]
  ).length;

  const _getLabelSelectionData = (object) => ({
    label_id: object._id,
    sample_id: sample._id,
    field: object.name,
    frame_number: object.frame_number,
  });

  const _selectAll = (labels) => {
    close();
    setSelectedLabels((selection) => ({
      ...selection,
      ...Object.fromEntries(
        labels
          .map(_getLabelSelectionData)
          .map(({ label_id, ...rest }) => [label_id, rest])
      ),
    }));
  };

  const selectAllInSample = () => _selectAll(sampleLabels);

  const unselectAllInSample = () => {
    close();
    setSelectedLabels((selection) =>
      removeMatchingLabelsFromSelection(selection, { sample_id: sample._id })
    );
  };

  const selectAllInFrame = () => _selectAll(frameLabels);

  const unselectAllInFrame = () => {
    close();
    setSelectedLabels((selection) =>
      removeMatchingLabelsFromSelection(selection, {
        sample_id: sample._id,
        frame_number: frameNumberRef.current,
      })
    );
  };

  const hideSelected = () => {
    close();
    const ids = Object.keys(selectedLabels);
    setSelectedLabels({});
    // can copy data directly from selectedObjects since it's in the same format
    setHiddenLabels((hiddenObjects) =>
      addLabelsToSelection(
        hiddenObjects,
        ids.map((label_id) => ({ label_id, ...selectedLabels[label_id] }))
      )
    );
  };

  const hideOthers = (labels) => {
    close();
    console.log(
      labels
        .filter((label) => !selectedLabels[label._id])
        .map(_getLabelSelectionData)
    );
    setHiddenLabels((hiddenLabels) =>
      addLabelsToSelection(
        hiddenLabels,
        labels
          .filter((label) => !selectedLabels[label._id])
          .map(_getLabelSelectionData)
      )
    );
  };
  return [
    sampleLabels.length && {
      text: "Select all (current sample)",
      disabled: numSampleSelectedObjects >= sampleLabels.length,
      onClick: () => selectAllInSample(),
    },
    sampleLabels.length && {
      text: "Unselect all (current sample)",
      disabled: !numSampleSelectedObjects,
      onClick: () => unselectAllInSample(),
    },
    frameLabels.length && {
      text: "Select all (current frame)",
      disabled: numFrameSelectedObjects >= frameLabels.length,
      onClick: () => selectAllInFrame(),
    },
    frameLabels.length && {
      text: "Unselect all (current frame)",
      disabled: !numFrameSelectedObjects,
      onClick: () => unselectAllInFrame(),
    },
    {
      text: "Clear selection",
      disabled: !numTotalSelectedObjects,
      onClick: () => {
        close();
        setSelectedLabels({});
      },
    },
    {
      text: "Hide selected",
      disabled: numTotalSelectedObjects == 0,
      onClick: () => hideSelected(),
    },
    sampleLabels.length && {
      text: "Hide others (current sample)",
      disabled: numSampleSelectedObjects == 0,
      onClick: () => hideOthers(sampleLabels),
    },
    frameLabels.length && {
      text: "Hide others (current frame)",
      disabled: numFrameSelectedObjects == 0,
      onClick: () => hideOthers(frameLabels),
    },
  ].filter(Boolean);
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
