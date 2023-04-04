import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useColorByField } from "./useLabelSelector";

// a react hook that fetches a list of brain results
// and has a loading state and an error state
export const useBrainResult = () => usePanelStatePartial("brainResult", null);
export function useBrainResultsSelector() {
  const [selected, setSelected] = useBrainResult();
  const dataset = useRecoilValue(fos.dataset);
  const [colorByField, setColorByField] = useColorByField();
  const handlers = {
    onSelect(selected) {
      setSelected(selected);
      setColorByField(null);
    },
    value: selected,
    toKey: (item) => item.key,
    useSearch: (search) => ({
      values: getBrainKeysFromDataset(dataset)
        .filter((item) => item.toLowerCase().includes(search.toLowerCase())),
    }),
  };

  return {
    handlers,
    brainKey: selected,
    canSelect: countValidBrainMethods(dataset) > 0,
    hasSelection: selected !== null,
  };
}

export function getBrainKeysFromDataset(dataset) {
  return dataset.brainMethods
    .filter(isVisualizationConfig)
    .map((item) => {
      return item.key;
    })
  }

function countValidBrainMethods(dataset) {
  const methods = dataset?.brainMethods || [];
  return methods.filter(isVisualizationConfig).length;
}

function isVisualizationConfig(item) {
  return item.config.cls.includes("fiftyone.brain.visualization");
}
