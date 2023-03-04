import * as fos from "@fiftyone/state";
import { genSort } from "../../utils/generic";

const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];
export const CHECKBOX_LIMIT = 20;

export const getValueString = (value): [string, boolean] => {
  if (NONSTRING_VALUES.includes(value)) {
    return [STRING_VALUES[NONSTRING_VALUES.indexOf(value)], true];
  }

  if (typeof value === "number") {
    return [value.toLocaleString(), true];
  }

  if (typeof value === "string" && !value.length) {
    return [`""`, true];
  }

  if (Array.isArray(value)) {
    return [`[${value.map((v) => getValueString(v)[0]).join(", ")}]`, false];
  }

  return [value as string, false];
};

export const joinStringArray = (arr: string[]) => {
  if (arr.length === 0) {
    return "";
  } else if (arr.length === 1) {
    return arr[0];
  } else if (arr.length === 2) {
    return `${arr[0]}, ${arr[1]}`;
  } else {
    let result = "";
    for (let i = 0; i < arr.length - 1; i++) {
      result += `${arr[i]}, `;
    }
    result += `and ${arr[arr.length - 1]}`;
    return result;
  }
};

export const nullSort = ({
  count,
  asc,
}: fos.SortResults): ((aa: V, bb: V) => number) => {
  return ({ count: aac, value: aav }, { count: bbc, value: bbv }): number => {
    let a = [aav, aac];
    let b = [bbv, bbc];

    if (count) {
      a.reverse();
      b.reverse();
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result = genSort(a[i], b[i], asc);
      if (result !== 0) {
        return result;
      }
    }

    return result;
  };
};
