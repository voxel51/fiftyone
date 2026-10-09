import * as fos from "@fiftyone/state";
import { useCallback } from "react";
import { useReverbValue } from "@fiftyone/reverb";
import { PanelItem, PanelList } from "../Panel";
import Popout from "../Popout";
import { useClearSampleSelection, useClearSelectedLabels } from "./hooks";

export default ({ close }: { close: () => void }) => {
  const elementNames = useReverbValue(fos.elementNames);
  const clearSelection = useClearSampleSelection(close);
  const setView = fos.useSetView();
  const selected = useReverbValue(fos.selectedSamples);
  const addStage = useCallback(
    (name: string) => {
      setView((cur = []) => [
        ...cur,
        {
          _cls: `fiftyone.core.stages.${name}`,
          kwargs: [["sample_ids", [...selected.keys()]]],
        },
      ]);
      close();
    },
    [close, selected, setView],
  );
  const selectedLabels = useReverbValue(fos.selectedLabelIds);
  const items: {
    key: string;
    text: string;
    title?: string;
    hidden?: boolean;
    onClick: () => void;
  }[] = [
    {
      key: "clear-labels",
      text: "Clear selected labels",
      hidden: !selectedLabels.size,
      onClick: useClearSelectedLabels(close),
    },
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
  ];

  return (
    <Popout modal={false}>
      <PanelList>
        {items.map(
          ({ key, hidden, ...props }) =>
            !hidden && <PanelItem key={key} {...props} />,
        )}
      </PanelList>
    </Popout>
  );
};
