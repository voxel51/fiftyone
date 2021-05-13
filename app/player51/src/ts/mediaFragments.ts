/**
 * Modified from https://github.com/tomayac/Media-Fragments-URI
 *
 * Copyright 2017-2021, Voxel51, Inc.
 */

// '&' is the only primary separator for key-value pairs
let SEPARATOR = "&";

// report errors?
let VERBOSE = true;

let logWarning = function (message) {
  if (VERBOSE) {
    console.log("Media Fragments URI Parsing Warning: " + message);
  }
};

interface FrameValue {
  value: string;
  unit: "npt";
  start: number;
  end: number;
  startNormalized: number;
  endNormalized: number;
}

type FrameResult = FrameValue | false;

const getTime = (value): FrameResult => {
  let components = value.split(",");
  if (components.length > 2) {
    return false;
  }
  let start = components[0] ? components[0] : "";
  let end = components[1] ? components[1] : "";
  if (
    (start === "" && end === "") ||
    (start && !end && value.indexOf(",") !== -1)
  ) {
    return false;
  }
  // hours:minutes:seconds.milliseconds
  let npt = /^((npt\:)?((\d+\:(\d\d)\:(\d\d))|((\d\d)\:(\d\d))|(\d+))(\.\d*)?)?$/;
  if (npt.test(start) && npt.test(end)) {
    start = start.replace(/^npt\:/, "");
    // replace a sole trailing dot, which is legal:
    // npt-sec = 1*DIGIT [ "." *DIGIT ]
    start = start.replace(/\.$/, "");
    end = end.replace(/\.$/, "");
    let convertToSeconds = function (time) {
      if (time === "") {
        return false;
      }
      // possible cases:
      // 12:34:56.789
      //    34:56.789
      //       56.789
      //       56
      let hours;
      let minutes;
      let seconds;
      time = time.split(":");
      let length = time.length;
      if (length === 3) {
        hours = parseInt(time[0], 10);
        minutes = parseInt(time[1], 10);
        seconds = parseFloat(time[2]);
      } else if (length === 2) {
        hours = 0;
        minutes = parseInt(time[0], 10);
        seconds = parseFloat(time[1]);
      } else if (length === 1) {
        hours = 0;
        minutes = 0;
        seconds = parseFloat(time[0]);
      } else {
        return false;
      }
      if (hours > 23) {
        logWarning("Please ensure that hours <= 23.");
        return false;
      }
      if (minutes > 59) {
        logWarning("Please ensure that minutes <= 59.");
        return false;
      }
      if (length > 1 && seconds >= 60) {
        // this constraint must not be applied if you specify only seconds
        logWarning("Please ensure that seconds < 60.");
        return false;
      }
      return hours * 3600 + minutes * 60 + seconds;
    };
    let startNormalized = convertToSeconds(start);
    let endNormalized = convertToSeconds(end);
    if (start && end) {
      if (startNormalized <= endNormalized) {
        return {
          value: value,
          unit: "npt",
          start: start,
          end: end,
          startNormalized: startNormalized,
          endNormalized: endNormalized,
        };
      } else {
        logWarning("Please ensure that start <= end.");
        return false;
      }
    } else {
      if (
        convertToSeconds(start) !== false ||
        convertToSeconds(end) !== false
      ) {
        return {
          value: value,
          unit: "npt",
          start: start,
          end: end,
          startNormalized: startNormalized === false ? "" : startNormalized,
          endNormalized: endNormalized === false ? "" : endNormalized,
        };
      } else {
        logWarning("Please ensure that start or end are legal.");
        return false;
      }
    }
  }
};

/**
 * splits an octet string into allowed key-value pairs
 */
let splitKeyValuePairs = function (octetString: string): FrameValue[] {
  let keyValuePairs = octetString.split(SEPARATOR);
  const results = [];
  keyValuePairs.forEach(function (keyValuePair) {
    // the key part is up to the first(!) occurrence of '=', further '='-s
    // form part of the value
    let position = keyValuePair.indexOf("=");
    if (position < 1) {
      return;
    }
    let components = [
      keyValuePair.substring(0, position),
      keyValuePair.substring(position + 1),
    ];
    // we require a value for each key
    if (!components[1]) {
      return;
    }

    const value = getTime(decodeURIComponent(components[1]));

    if (!value) {
      return;
    }
    results.push(value);
  });
  return results;
};

function parseMediaFragmentsUri(opt_uri: string): FrameValue[] {
  let uri = opt_uri ? opt_uri : window.location.href;
  // retrieve the query part of the URI
  let indexOfHash = uri.indexOf("#");
  // retrieve the hash part of the URI
  let hash = indexOfHash !== -1 ? uri.substring(indexOfHash + 1) : "";
  let hashValues = splitKeyValuePairs(hash);
  return hashValues;
}

interface MediaFragment {
  startTime: number;
  endTime: number;
}

export const getMediaFragment = (src: string): MediaFragment | null => {
  const mfResult = parseMediaFragmentsUri(src);

  if (typeof mfResult.length) {
    return {
      startTime: mfResult[0].startNormalized,
      endTime: mfResult[0].endNormalized,
    };
  }
  return null;
};
