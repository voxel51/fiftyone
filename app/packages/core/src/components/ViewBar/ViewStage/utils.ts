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
