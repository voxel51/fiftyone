export const computeBestMatchString = (options, value) => {
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
