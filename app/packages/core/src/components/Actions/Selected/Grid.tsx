import * as fos from "@fiftyone/state";
import type { MutableRefObject } from "react";
import React, { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { ActionOption } from "../Common";
import Popout from "../Popout";
import { useClearSampleSelection, useClearSelectedLabels } from "./hooks";

export default ({
  anchorRef,
  close,
}: {
  anchorRef: MutableRefObject<HTMLElement | null>;
  close: () => void;
}) => {
  const elementNames = useRecoilValue(fos.elementNames);
  const clearSelection = useClearSampleSelection(close);
  const setView = fos.useSetView();
  const selected = useRecoilValue(fos.selectedSamples);
  const addStage = useCallback(
    (name: string) => {
      setView((cur = []) => [
        ...cur,
        {
          _cls: `fiftyone.core.stages.${name}`,
          kwargs: [["sample_ids", [...selected]]],
        },
      ]);
      close();
    },
    [close, selected, setView]
  );
  const selectedLabels = useRecoilValue(fos.selectedLabelIds);
  const items = [
    {
      key: "clear-labels",
      text: "Clear selected labels",
      hidden: !selectedLabels.size,
      onClick: useClearSelectedLabels(close),
    },
  ];

  return (
    <Popout modal={false} fixed anchorRef={anchorRef}>
      {[
        ...items,
        {
          key: "clear",
          onClick: clearSelection,
          text: `Clear selected ${elementNames.plural}`,
          title: `Deselect all selected ${elementNames.plural}`,
        },
        {
          key: "show",
          onClick: () => addStage("Select"),
          text: `Only show selected ${elementNames.plural}`,
          title: `Hide all other ${elementNames.plural}`,
        },
        {
          key: "hide",
          onClick: () => addStage("Exclude"),
          text: `Hide selected ${elementNames.plural}`,
          title: `Show only unselected ${elementNames.plural}`,
        },
      ].map(({ key, ...props }) => (
        <ActionOption key={key} {...props} />
      ))}
    </Popout>
  );
};
