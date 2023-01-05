const NONSTRING_VALUES: any[] = [false, true, null];
const STRING_VALUES = ["False", "True", "None"];

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
    return `${arr[0]} and ${arr[1]}`;
  } else {
    let result = "";
    for (let i = 0; i < arr.length - 1; i++) {
      result += `${arr[i]}, `;
    }
    result += `and ${arr[arr.length - 1]}`;
    return result;
  }
};
