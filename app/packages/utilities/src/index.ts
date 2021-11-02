import _ from "lodash";

export const toCamelCase = (obj: object): object =>
  _.transform(obj, (acc, value, key, target) => {
    const camelKey = _.isArray(target) ? key : _.camelCase(key);

    acc[
      `${typeof key === "string" && key.startsWith("_") ? "_" : ""}${camelKey}`
    ] = _.isObject(value) ? toCamelCase(value) : value;
  });

export const toSnakeCase = (obj: object): object =>
  _.transform(obj, (acc, value, key, target) => {
    const snakeKey = _.isArray(target) ? key : _.snakeCase(key);

    acc[snakeKey] = _.isObject(value) ? toSnakeCase(value) : value;
  });

export const move = (array, moveIndex, toIndex) => {
  const item = array[moveIndex];
  const length = array.length;
  const diff = moveIndex - toIndex;

  if (diff > 0) {
    // move left
    return [
      ...array.slice(0, toIndex),
      item,
      ...array.slice(toIndex, moveIndex),
      ...array.slice(moveIndex + 1, length),
    ];
  } else if (diff < 0) {
    // move right
    const targetIndex = toIndex + 1;
    return [
      ...array.slice(0, moveIndex),
      ...array.slice(moveIndex + 1, targetIndex),
      item,
      ...array.slice(targetIndex, length),
    ];
  }
  return array;
};
