import { prettify as pretty, useExternalLink } from "@fiftyone/utilities";
import React from "react";
import styled from "styled-components";

export const isFloat = (n: number): boolean => {
  return Number(n) === n && n % 1 !== 0;
};

const Link = styled.a`
  color: ${({ theme }) => theme.text.primary};
`;

export const ExternalLink = ({ href, ...props }) => {
  const onClick = useExternalLink(href);
  return <Link {...props} href={href} target="_blank" onClick={onClick} />;
};

export const prettify = (
  v: boolean | string | null | undefined | number | number[]
): React.ReactNode => {
  const result = pretty(v);

  if (result instanceof URL) {
    const url = result.toString();
    return (
      <ExternalLink title={url} href={url}>
        {url}
      </ExternalLink>
    );
  }

  return result;
};

export const genSort = (a, b, asc) => {
  if (a === b) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  if (a > b) {
    return asc ? 1 : -1;
  }

  return asc ? -1 : 1;
};

export const formatDateTime = (timeStamp: number, timeZone: string): string => {
  const twoDigit = "2-digit";
  const MS = 1000;
  const S = 60 * MS;
  const M = 60 * S;
  const H = 24 * M;

  const options: Intl.DateTimeFormatOptions = {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    day: twoDigit,
    month: twoDigit,
    hour: twoDigit,
    hour12: false,
    minute: twoDigit,
    second: twoDigit,
    // @ts-ignore
    fractionalSecondDigits: 3,
  };

  if (!(timeStamp % MS)) {
    // @ts-ignore
    delete options.fractionalSecondDigits;
  }

  if (!(timeStamp % H)) {
    delete options.second;
    delete options.minute;
    delete options.hour;
  }

  return new Intl.DateTimeFormat("en-ZA", options)
    .format(timeStamp)
    .replaceAll("/", "-")
    .replace(", ", " ")
    .replace(",", ".");
};

export const getDateTimeRangeFormattersWithPrecision = (() => {
  const twoDigit = "2-digit";
  const locale = "en-CA";

  return (
    timeZone: string,
    d1: number,
    d2: number
  ): { common: Intl.DateTimeFormat | null; diff: Intl.DateTimeFormat } => {
    timeZone = resolveTimeZone(timeZone);

    let common: Intl.DateTimeFormatOptions | null = { timeZone, hour12: false };
    let diff: Intl.DateTimeFormatOptions = {
      timeZone,
      hour12: false,
    };

    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      year: "numeric",
      month: twoDigit,
      day: twoDigit,
    });
    const date1Str = formatter.format(d1);
    const date2Str = formatter.format(d2);
    const sameDay = date1Str === date2Str;

    if (sameDay) {
      common = {
        year: "numeric",
        month: twoDigit,
        day: twoDigit,
        ...common,
      };
      diff = {
        hour: twoDigit,
        minute: twoDigit,
        second: twoDigit,
        fractionalSecondDigits: 3,
        ...diff,
      };
    } else {
      common = null;
      diff = {
        year: "numeric",
        month: twoDigit,
        day: twoDigit,
        hour: twoDigit,
        minute: twoDigit,
        second: twoDigit,
        fractionalSecondDigits: 3,
        ...diff,
      };
    }

    return {
      common: common ? new Intl.DateTimeFormat(locale, common) : null,
      diff: new Intl.DateTimeFormat(locale, diff),
    };
  };
})();

const resolveTimeZone = (tz: string) =>
  tz === "local"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : !tz
    ? "UTC"
    : tz;
