import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { usePanelStatePartial } from "@fiftyone/spaces";
import { useColorByChoices } from "./useColorByChoices";

// a react hook that allows for selecting a label
// based on the available labels in the given sample

export const useColorByField = () => usePanelStatePartial("colorByField", null);
export function useLabelSelector() {
  const dataset = useRecoilValue(fos.dataset);
  const fullSchema = useRecoilValue(fos.fullSchema);
  const [label, setLabel] = useColorByField();
  const { availableFields, isLoading } = useColorByChoices();

  const handlers = {
    onSelect(selected) {
      if (selected === "uncolored") {
        selected = null;
      }
      setLabel(selected);
    },
    value: label,
    toKey: (item) => item,
    useSearch: (search) => ({
      values:
        availableFields &&
        availableFields.filter((item) =>
          item.toLowerCase().includes(search.toLowerCase())
        ),
    }),
  };

  return {
    label,
    handlers,
    isLoading,
    canSelect: !isLoading && availableFields && availableFields.length > 0,
  };
}
