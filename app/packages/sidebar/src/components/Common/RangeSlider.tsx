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
import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";
import { getFormatter, getPrecision, getStep } from "./utils";

const SliderContainer = styled.div`
  font-weight: bold;
  padding: 0.25rem 0.5rem 0.75rem;
`;

const Title = styled.div`
  width: 100%;
  text-align: center;
  padding: 0.25rem;
  color: ${cssVar.color.text.primary};
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
 * A two-knob slider over a field's bounds. A release commits only the knobs
 * that moved; a knob released on its bound commits `null`, an open end.
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
  const { formatter, hasTitle } = getFormatter(fieldType, zone, bounds);
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
    <>
      {hasTitle && (
        <Title>
          {getDateTimeRangeFormattersWithPrecision(
            timeZone || "UTC",
            min,
            max,
          ).common?.format(min)}
        </Title>
      )}
      <SliderContainer>
        <MultiValueSlider
          data-cy="slider"
          bare
          knobLabel
          formatLabel={formatter}
          min={min}
          max={max}
          step={getStep(bounds, fieldType)}
          value={sliderValue}
          onChangeCommitted={onCommit}
          // the field's color in place of the brand fill
          style={{ "--color-brand-primary": color } as React.CSSProperties}
        />
      </SliderContainer>
    </>
  );
};

export default RangeSlider;
