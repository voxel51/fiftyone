import React, { useEffect, useState } from "react";
import numeral from "numeral";
import styled from "styled-components";
import {
  RecoilState,
  RecoilValueReadOnly,
  SetterOrUpdater,
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
} from "recoil";
import { Slider as SliderUnstyled } from "@material-ui/core";

import Checkbox from "../Common/Checkbox";
import { Button } from "../FieldsSidebar";
import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  FLOAT_FIELD,
  FRAME_NUMBER_FIELD,
  INT_FIELD,
} from "../../utils/labels";
import { PopoutSectionTitle } from "../utils";
import * as selectors from "../../recoil/selectors";
import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";
import { useTheme } from "../../utils/hooks";
import { isDateTimeField, OtherCounts } from "./NumericFieldFilter.state";
import { FRAME_SUPPORT_FIELD } from "@fiftyone/looker/src/constants";
import ExcludeOption from "./Exclude";

const SliderContainer = styled.div`
  font-weight: bold;
  display: flex;
  padding: 1.5rem 0 0.5rem;
  line-height: 1.9rem;
`;

const SliderStyled = styled(SliderUnstyled)`
  && {
    color: ${({ theme }) => theme.brand};
    margin: 0 1.5rem 0 1.3rem;
    height: 3px;
  }

  .rail {
    height: 7px;
    border-radius: 6px;
  }

  .track {
    height: 7px;
    border-radius: 6px;
    background: ${({ theme }) => theme.brand};
  }

  .thumb {
    height: 1rem;
    width: 1rem;
    border-radius: 0.5rem;
    background: ${({ theme }) => theme.brand};
    box-shadow: none;
    color: transparent;
  }

  .thumb:hover,
  .thumb:focus,
  .thumb.active {
    box-shadow: none;
  }

  .valueLabel {
    width: auto;
    margin-top: 0.5rem;
    font-weight: bold;
    font-family: "Palanquin", sans-serif;
    font-size: 14px;
    padding: 0.2rem;
    border-radius: 6rem;
    color: transparent;
    transform: none !important;
    margin-top: -4px;
  }

  .valueLabel > span > span {
    text-align: center;
    color: ${({ theme }) => theme.font};
    background: ${({ theme }) => theme.backgroundDark};
    border: 1px solid ${({ theme }) => theme.backgroundDarkBorder};
  }
`;

const getFormatter = (fieldType, timeZone, bounds) => {
  let hasTitle = false;
  let dtFormatters;
  const date = [DATE_TIME_FIELD, DATE_FIELD].includes(fieldType);

  if (date) {
    dtFormatters = getDateTimeRangeFormattersWithPrecision(
      timeZone,
      bounds[0],
      bounds[1]
    );

    hasTitle = dtFormatters[0] !== null;
  }

  return {
    hasTitle,
    formatter: (v) => {
      if (date) {
        const str = dtFormatters[1].format(v).split(",");
        if (str.length === 1) {
          const day = str[0].split("-");
          if (day.length === 3) {
            const [y, m, d] = day;
            return (
              <div>
                {y}&#8209;{m}&#8209;{d}
              </div>
            );
          }

          return str[0];
        }

        let [day, time] = str;

        if (dtFormatters[1].resolvedOptions().fractionalSecondDigits === 3) {
          time += "ms";
          return (
            <>
              <div>{day}</div>
              <div>{time}</div>
            </>
          );
        }

        const [y, m, d] = day.split("/");

        return (
          <>
            <div>
              {y}&#8209;{m}&#8209;{d}
            </div>
            {time && <div>{time}</div>}
          </>
        );
      }

      return numeral(v).format(
        [INT_FIELD, FRAME_NUMBER_FIELD, FRAME_SUPPORT_FIELD].includes(fieldType)
          ? "0a"
          : "0.00a"
      );
    },
  };
};

const getStep = (bounds: [number, number], fieldType?: string): number => {
  const delta = bounds[1] - bounds[0];
  const max = 100;

  let step = delta / max;
  if (
    [INT_FIELD, FRAME_NUMBER_FIELD, FRAME_SUPPORT_FIELD].includes(fieldType)
  ) {
    return Math.ceil(step);
  }

  return step;
};

type SliderValue = number | undefined;

export type Range = [SliderValue, SliderValue];

type BaseSliderProps = {
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  value: Range | number;
  onChange: (e: Event, v: Range | number) => void;
  onCommit: (e: Event, v: Range | number) => void;
  persistValue?: boolean;
  showBounds?: boolean;
  fieldType?: string;
  showValue: boolean;
  int?: boolean;
  style?: React.CSSProperties;
};

const BaseSlider = React.memo(
  ({
    boundsAtom,
    color,
    fieldType,
    onChange,
    onCommit,
    persistValue = true,
    showBounds = true,
    value,
    style,
    showValue = true,
  }: BaseSliderProps) => {
    const theme = useTheme();
    const bounds = useRecoilValue(boundsAtom);

    const timeZone =
      fieldType && isDateTimeField(fieldType)
        ? useRecoilValue(selectors.timeZone)
        : null;
    const [clicking, setClicking] = useState(false);

    const hasBounds = bounds.every((b) => b !== null);

    if (!hasBounds) {
      return null;
    }

    const step = getStep(bounds, fieldType);
    const { formatter, hasTitle } = getFormatter(
      fieldType,
      fieldType === DATE_FIELD ? "UTC" : timeZone,
      bounds
    );

    return (
      <>
        {hasTitle ? (
          <>
            {
              <div
                style={{
                  width: "100%",
                  textAlign: "center",
                  padding: "0.25rem",
                  color: theme.font,
                }}
              >
                {getDateTimeRangeFormattersWithPrecision(
                  timeZone,
                  bounds[0],
                  bounds[1]
                )[0]
                  .format(bounds[0])
                  .replaceAll("/", "-")}
              </div>
            }
          </>
        ) : null}
        <SliderContainer style={style}>
          {showBounds && formatter(bounds[0])}
          <SliderStyled
            onMouseDown={() => setClicking(true)}
            onMouseUp={() => setClicking(false)}
            value={value}
            onChange={onChange}
            onChangeCommitted={(e, v) => {
              onCommit(e, v);
              setClicking(false);
            }}
            classes={{
              thumb: "thumb",
              track: "track",
              rail: "rail",
              active: "active",
              valueLabel: "valueLabel",
            }}
            valueLabelFormat={formatter}
            aria-labelledby="slider"
            valueLabelDisplay={
              (clicking || persistValue) && showValue ? "on" : "off"
            }
            max={bounds[1]}
            min={bounds[0]}
            step={step}
            theme={{ ...theme, brand: color }}
          />
          {showBounds && formatter(bounds[1])}
        </SliderContainer>
      </>
    );
  }
);

type SliderProps = {
  valueAtom: RecoilState<SliderValue>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  persistValue?: boolean;
  fieldType?: string;
  showValue?: boolean;
  showBounds?: boolean;
  onChange?: boolean;
  int?: boolean;
};

export const Slider = ({ valueAtom, onChange, ...rest }: SliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<SliderValue>(null);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v) => (onChange ? setValue(v) : setLocalValue(v))}
      onCommit={(_, v) => setValue(v)}
      value={localValue}
    />
  );
};

type RangeSliderProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  color: string;
  showBounds?: boolean;
  fieldType: string;
};

export const RangeSlider = ({ valueAtom, ...rest }: RangeSliderProps) => {
  const [value, setValue] = useRecoilState(valueAtom);
  const [localValue, setLocalValue] = useState<Range>([null, null]);
  useEffect(() => {
    JSON.stringify(value) !== JSON.stringify(localValue) &&
      setLocalValue(value);
  }, [value]);

  return (
    <BaseSlider
      {...rest}
      onChange={(_, v: Range) => setLocalValue(v)}
      onCommit={(_, v) => setValue(v)}
      value={[...localValue]}
    />
  );
};

const NamedRangeSliderContainer = styled.div`
  padding-bottom: 0.5rem;
  margin: 3px;
  font-weight: bold;
`;

const NamedRangeSliderHeader = styled.div`
  display: flex;
  justify-content: space-between;
`;

const RangeSliderContainer = styled.div`
  background: ${({ theme }) => theme.backgroundDark};
  border: 1px solid #191c1f;
  border-radius: 2px;
  color: ${({ theme }) => theme.fontDark};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem 0 0.5rem;
`;

export type Other = "nan" | "ninf" | "inf" | "none";

const OTHER_NAMES = {
  nan: "nan",
  ninf: "-inf",
  inf: "inf",
  none: null,
};

type NamedProps = {
  valueAtom: RecoilState<Range>;
  boundsAtom: RecoilValueReadOnly<Range>;
  excludeAtom?: RecoilState<boolean>;
  otherCountsAtom: RecoilValueReadOnly<OtherCounts>;
  otherFilteredCountsAtom: RecoilValueReadOnly<OtherCounts>;
  getOtherAtom: (key: Other) => RecoilState<boolean>;
  fieldType: string;
  name?: string;
  color: string;
};

const isDefaultRange = (range, bounds) => {
  return bounds.every((b, i) => b === range[i]);
};

export const NamedRangeSlider = React.memo(
  React.forwardRef(
    (
      {
        otherCountsAtom,
        otherFilteredCountsAtom,
        name,
        getOtherAtom,
        fieldType,
        excludeAtom,
        ...rangeSliderProps
      }: NamedProps,
      ref
    ) => {
      const [range, setRange] = useRecoilState(rangeSliderProps.valueAtom);
      const bounds = useRecoilValue(rangeSliderProps.boundsAtom);
      const hasDefaultRange = isDefaultRange(range, bounds);
      const hasBounds = bounds.every((b) => b !== null);
      const otherCounts = useRecoilValue(otherCountsAtom);
      const otherFilteredCounts = useRecoilValue(otherFilteredCountsAtom);

      const others: [
        Other,
        [boolean, SetterOrUpdater<boolean>]
      ][] = (fieldType === FLOAT_FIELD
        ? (["inf", "ninf", "nan", "none"] as Other[])
        : (["none"] as Other[])
      )
        .map((key) => [key, useRecoilState(getOtherAtom(key))])
        .filter(([key]) => otherCounts[key as string] > 0);

      const onlyNoneOther = others.length === 1 && others[0][0] === "none";

      if (!hasBounds && onlyNoneOther) {
        return null;
      }

      console.log(name, hasBounds, onlyNoneOther, otherCounts);

      return (
        <NamedRangeSliderContainer ref={ref}>
          {name && <NamedRangeSliderHeader>{name}</NamedRangeSliderHeader>}
          <RangeSliderContainer>
            {hasBounds && (
              <RangeSlider
                {...rangeSliderProps}
                showBounds={false}
                fieldType={fieldType}
              />
            )}
            {hasDefaultRange &&
              others
                .filter(([k]) => otherCounts[k] > 0)
                .map(([key, [value, setValue]]) => {
                  return (
                    <Checkbox
                      color={rangeSliderProps.color}
                      name={OTHER_NAMES[key]}
                      value={value}
                      setValue={setValue}
                      count={otherCounts[key]}
                      forceColor={true}
                    />
                  );
                })}
            {excludeAtom && !onlyNoneOther && (
              <ExcludeOption
                excludeAtom={excludeAtom}
                valueName={""}
                color={rangeSliderProps.color}
              />
            )}
          </RangeSliderContainer>
        </NamedRangeSliderContainer>
      );
    }
  )
);

export default RangeSlider;
