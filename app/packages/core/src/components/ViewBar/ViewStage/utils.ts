export const computeBestMatchString = (options, value) => {
  value = value || "";
  const match = options.filter((n) =>
    n.toLowerCase().startsWith(value.toLowerCase())
  )[0];
  if (match && value.length) {
    return {
      placeholder: match.slice(value.length),
      value: match,
    };
  }
  return { placeholder: "", value: null };
};

export const getMatch = (options, value) => {
  const results = options.filter(
    (o) => o.toLowerCase() === value.toLowerCase()
  );
  if (results.length === 1) {
    return results[0];
  }
  return null;
};

export const cleanCSV = (values: string) => {
  return (
    values
      // replace spaces with a single space (to allow search by words with spaces)
      .replace(/[\s\'\"\[\]]+/g, " ")
      // replace comma followed by trailing spaces with a single comma
      .replace(/,\s*/g, ",")
      // remove trailing spaces
      .replace(/[ \t]+$/, "")
  );
};

export const getArray = (value: string | unknown[]): unknown[] => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value.replace(/[\s]/g, "").split(",");
    }
  }

  return value;
};
