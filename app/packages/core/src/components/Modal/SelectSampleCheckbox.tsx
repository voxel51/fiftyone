import * as fos from "@fiftyone/state";
import type { SelectionIconStyle } from "@fiftyone/state";
import {
  lookerCheckbox,
  lookerLabel,
  selectionIconBookmark,
  selectionIconCheckmark,
  selectionIconGreenCheckmark,
  selectionIconPin,
  selectionIconRedCheckmark,
  selectionIconStar,
  selectionIconThumbsdown,
  selectionIconThumbsup,
  selectionIconX,
} from "@fiftyone/looker";
import { useRecoilValue } from "recoil";

interface SelectSampleCheckboxProps {
  sampleId: string;
}

const ICON_CLASS_MAP: Record<SelectionIconStyle, string> = {
  checkmark: selectionIconCheckmark,
  "green-checkmark": selectionIconGreenCheckmark,
  "red-checkmark": selectionIconRedCheckmark,
  thumbsup: selectionIconThumbsup,
  thumbsdown: selectionIconThumbsdown,
  pin: selectionIconPin,
  star: selectionIconStar,
  x: selectionIconX,
  bookmark: selectionIconBookmark,
};

export const SelectSampleCheckbox = ({
  sampleId,
}: SelectSampleCheckboxProps) => {
  const selectedSamplesMap = useRecoilValue(fos.selectedSamples);
  const style = useRecoilValue(fos.sampleSelectionStyle);
  const select = fos.useSelectSample();

  const isSelected = selectedSamplesMap.has(sampleId);
  const { selectionIcon } = fos.resolveSelectionIcon(
    selectedSamplesMap,
    style,
    sampleId,
    isSelected
  );

  const iconClass = selectionIcon ? ICON_CLASS_MAP[selectionIcon] : undefined;

  return (
    <label
      className={lookerLabel}
      title={isSelected ? "Deselect sample" : "Select sample"}
      data-cy="select-sample-checkbox"
      onClick={(e) => {
        e.preventDefault();
        select(sampleId, e.altKey);
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        className={iconClass}
        onChange={() => {}}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span
        className={lookerCheckbox}
        style={{ margin: 0, display: "inline-block" }}
      />
    </label>
  );
};
