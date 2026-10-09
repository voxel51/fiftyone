import * as fos from "@fiftyone/state";
import { DATE_FIELD } from "@fiftyone/utilities";
import { cssVar, MultiValueSlider } from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  type ReverbState,
  type ReverbValueReadOnly,
  useReverbState,
  useReverbValue,
} from "@fiftyone/reverb";
import styled from "styled-components";
import { getFormatter, getPrecision, getStep } from "./utils";

const SliderContainer = styled.div`
  color: ${cssVar.color.text.secondary};
`;

type SliderValue = number | undefined | null;

export type Range = [SliderValue, SliderValue];

function isBoundsValid(bounds: Range): bounds is [number, number] {
  return typeof bounds[0] === "number" && typeof bounds[1] === "number";
}

type RangeSliderProps = {
  valueAtom: ReverbState<Range>;
  boundsAtom: ReverbValueReadOnly<Range>;
  color: string;
  fieldType: string;
};

/**
 * A two-knob slider over a field's bounds, labeled at its ends. A release
 * commits only the knobs that moved; a knob released on its bound commits
 * `null`, an open end.
 */
export const RangeSlider = ({
  valueAtom,
  boundsAtom,
  color,
  fieldType,
}: RangeSliderProps) => {
  const [value, setValue] = useReverbState(valueAtom);
  const bounds = useReverbValue(boundsAtom);
  const timeZone = useReverbValue(fos.timeZone);
  const [min, max] = isBoundsValid(bounds) ? bounds : [0, 0];
  const sliderValue = useMemo(
    () => [value[0] ?? min, value[1] ?? max],
    [value, min, max],
  );

  if (!isBoundsValid(bounds)) {
    return null;
  }

  const zone = fieldType === DATE_FIELD ? "UTC" : timeZone || "UTC";
  // a range within one day labels times; a longer one carries its dates
  const { formatter } = getFormatter(fieldType, zone, bounds);
  // Restrict numeric precision to better represent the slider controls.
  const precision = getPrecision(fieldType, bounds);
  const toValue = (v: number, bound: number) =>
    v === bound ? null : parseFloat(v.toFixed(precision));

  const onCommit = ([low, high]: number[]) => {
    if (low !== sliderValue[0]) {
      setValue((prev) => [toValue(low, min), prev[1]]);
    }
    if (high !== sliderValue[1]) {
      setValue((prev) => [prev[0], toValue(high, max)]);
    }
  };

  return (
    <SliderContainer>
      <MultiValueSlider
        data-cy="slider"
        bare
        labeled
        formatLabel={formatter}
        min={min}
        max={max}
        step={getStep(bounds, fieldType)}
        value={sliderValue}
        onChangeCommitted={onCommit}
        style={
          {
            // the field's color in place of the brand fill
            "--color-brand-primary": color,
            // end labels sit tight to the track
            gap: 4,
          } as React.CSSProperties
        }
      />
    </SliderContainer>
  );
};

export default RangeSlider;
