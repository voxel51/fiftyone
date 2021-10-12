import mime from "mime";

export const isElectron = (): boolean => {
  return (
    window.process &&
    window.process.versions &&
    Boolean(window.process.versions.electron)
  );
};

export const isFloat = (n: number): boolean => {
  return Number(n) === n && n % 1 !== 0;
};

export const summarizeLongStr = (
  s: string,
  maxLen: number,
  mode: string = "middle"
): string => {
  if (s.length <= maxLen) {
    return s;
  }

  const modeLower = mode.toLowerCase();

  if (modeLower === "first") {
    return "..." + s.slice(-(maxLen - 3));
  }

  if (modeLower === "middle") {
    const len1 = Math.ceil(0.5 * (maxLen - 3));
    const len2 = Math.floor(0.5 * (maxLen - 3));
    return s.slice(0, len1) + "..." + s.slice(-len2);
  }

  if (modeLower === "last") {
    return s.slice(0, maxLen - 3) + "...";
  }

  throw new Error(`Unsupported mode '${mode}'`);
};

export const prettify = (
  v: boolean | string | null | undefined | number | number[],
  summarize: boolean = true,
  maxStrLen: number = 27
): string => {
  if (typeof v === "string") {
    return summarize ? summarizeLongStr(v, maxStrLen) : v;
  } else if (typeof v === "number") {
    return Number(v.toFixed(3)).toLocaleString();
  } else if (v === true) {
    return "True";
  } else if (v === false) {
    return "False";
  } else if ([undefined, null].includes(v)) {
    return "None";
  } else if (Array.isArray(v)) {
    v = `[${v.join(", ")}]`;
    return summarize ? summarizeLongStr(v, maxStrLen) : v;
  }
  return null;
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

export const getMimeType = (sample: any) => {
  return (
    (sample.metadata && sample.metadata.mime_type) ||
    mime.getType(sample.filepath) ||
    "image/jpg"
  );
};

export const formatDateTime = (timeStamp: number, timeZone: string): string => {
  const twoDigit = "2-digit";
  const MS = 1000;
  const S = 60 * MS;
  const M = 60 * S;
  const H = 24 * M;

  const options: Intl.DateTimeFormatOptions = {
    timeZone,
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
  const locale = "en-ZA";

  const MS = 1000;
  const S = 60 * MS;
  const M = 60 * S;
  const H = 24 * M;

  return (
    timeZone: string,
    d1: number,
    d2: number
  ): [Intl.DateTimeFormat | null, Intl.DateTimeFormat] => {
    const delta = Math.abs(d1 - d2);
    let common: Intl.DateTimeFormatOptions = { timeZone, hour12: false };
    let diff: Intl.DateTimeFormatOptions = { timeZone, hour12: false };

    if (d1 % H === 0 && d2 % H === 0) {
      common = null;
      diff = {
        year: "numeric",
        month: twoDigit,
        day: twoDigit,
      };
    } else if (delta < MS) {
      common = {
        year: "numeric",
        day: twoDigit,
        month: twoDigit,
      };
      diff = {
        hour: twoDigit,
        minute: twoDigit,
        second: twoDigit,
        // @ts-ignore
        fractionalSecondDigits: 3,
      };
    } else if (delta < S) {
      common = {
        year: "numeric",
        day: twoDigit,
        month: twoDigit,
        hour: twoDigit,
        minute: twoDigit,
      };
      diff = {
        second: twoDigit,
        // @ts-ignore
        fractionalSecondDigits: 3,
      };
    } else if (delta < M) {
      common = {
        year: "numeric",
        day: twoDigit,
        month: twoDigit,
      };
      diff = {
        hour: twoDigit,
        minute: twoDigit,
        second: twoDigit,
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
      };
    }

    return [
      common ? new Intl.DateTimeFormat(locale, common) : null,
      new Intl.DateTimeFormat(locale, diff),
    ];
  };
})();
