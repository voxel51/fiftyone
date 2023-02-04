import numeral from "numeral";
import React from "react";

import {
  DATE_FIELD,
  DATE_TIME_FIELD,
  FRAME_NUMBER_FIELD,
  FRAME_SUPPORT_FIELD,
  INT_FIELD,
} from "@fiftyone/utilities";

import { getDateTimeRangeFormattersWithPrecision } from "../../utils/generic";

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

export const getStep = (
  bounds: [number, number],
  fieldType?: string
): number => {
  const delta = bounds[1] - bounds[0];
  const max = 100;

  const step = delta / max;
  if (
    [INT_FIELD, FRAME_NUMBER_FIELD, FRAME_SUPPORT_FIELD].includes(fieldType)
  ) {
    return Math.ceil(step);
  }

  return step;
};

export const toSlug = (name: string) => {
  /**  Returns the URL-friendly slug for the given string.
   *
   * The following strategy is used to generate slugs:
   *   (based on fiftyone.core.utils `to_slug` function)
   *   -   The characters ``A-Za-z0-9`` are converted to lowercase
   *   -   Whitespace and ``+_.-`` are converted to ``-``
   *   -   All other characters are omitted
   *   -   All consecutive ``-`` characters are reduced to a single ``-``
   *   -   All leading and trailing ``-`` are stripped
   */
  if (name.length < 1) {
    return "";
  }
  const valid_chars = new RegExp("[a-z0-9._+-]", "g");
  const replace_symbols = new RegExp("[-._+]+", "g");
  const trim = new RegExp("-?(?<slug>[0-9a-z][0-9a-z-]*?)-?$");

  let slug = name.toLowerCase();
  let matches = [];
  let match;
  while ((match = valid_chars.exec(name.toLowerCase())) !== null) {
    matches.push(match);
  }
  if (matches.length) {
    slug = matches.join("")?.replace(replace_symbols, "-");
    if (slug.length && slug !== "-") {
      return slug.length ? trim.exec(slug)?.groups?.slug : "";
    }
  }
  return "";
};
