export const getUniqueDatasetNameWithPrefix = (prefix: string) => {
  // append seven characters random string to the prefix
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
};

export const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
