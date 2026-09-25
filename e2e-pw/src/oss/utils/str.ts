export const getUniqueDatasetNameWithPrefix = (prefix: string) => {
  // append seven characters random string to the prefix
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
};

export const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Matches `value` as the whole string */
export const exactText = (value: string) =>
  new RegExp(`^${escapeRegExp(value)}$`);

/** Matches `value` as one token of a space-separated list */
export const spaceToken = (value: string) =>
  new RegExp(`(^| )${escapeRegExp(value)}( |$)`);
