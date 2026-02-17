import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
} from "@fiftyone/utilities";
import numeral from "numeral";
import React from "react";

import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";

/**
 * Get the format string for the given type and bounds.
 *
 * This string is compatible with the numeral library.
 *
 * @param fieldType Field type
 * @param bounds Field bounds
 * @return numeral-compatible format string
 */
const getNumeralFormat = (
  fieldType: string,
  bounds: [number, number]
): string => {
  const precision = getPrecision(fieldType, bounds);
  if (precision > 0) {
    const zeros = new Array(precision).fill("0").join("");
    return `0.${zeros}a`;
  } else {
    return "0a";
  }
};

export const getFormatter = (fieldType: string, timeZone: string, bounds) => {
  let hasTitle = false;
  let dtFormatters;
  const date = [DATE_TIME_FIELD, DATE_FIELD].includes(fieldType);

  if (date) {
    dtFormatters = getDateTimeRangeFormattersWithPrecision(
      timeZone,
      bounds[0],
      bounds[1]
    );

    hasTitle = !!dtFormatters.common;
  }

  return {
    hasTitle,
    formatter: (v) => {
      if (date) {
        const str = dtFormatters.diff.format(v).split(",");
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

        if (dtFormatters.diff.resolvedOptions().fractionalSecondDigits === 3) {
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

      const format = getNumeralFormat(fieldType, bounds);
      const str = numeral(v).format(format);
      return str === "NaN" ? v.toString() : str;
    },
  };
};

export const getStep = (
  bounds: [number, number],
  fieldType?: string
): number => {
  const delta = bounds[1] - bounds[0];
  const max = 100;

  const step = delta / max;
  if (
    fieldType &&
    [INT_FIELD, FRAME_NUMBER_FIELD, FRAME_SUPPORT_FIELD].includes(fieldType)
  ) {
    return Math.ceil(step);
  }

  return step;
};

/**
 * Get the recommended number of digits for the given type and bounds.
 *
 * @param fieldType Field type
 * @param bounds Field bounds
 * @return Recommended number of digits
 */
export const getPrecision = (
  fieldType: string,
  bounds: [number, number]
): number => {
  if ([DATE_TIME_FIELD, DATE_FIELD].includes(fieldType)) {
    // float precision for date/datetime
    return 7;
  } else if (
    [INT_FIELD, FRAME_NUMBER_FIELD, FRAME_SUPPORT_FIELD].includes(fieldType)
  ) {
    // no decimals for integers
    return 0;
  } else if (bounds[1] - bounds[0] < 0.1) {
    // 4 decimals for small floats
    return 4;
  } else {
    // 2 decimals for "normal"-sized floats
    return 2;
  }
};
