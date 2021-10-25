import _ from "lodash";

export const toCamelCase = (obj: object): object =>
  _.transform(obj, (acc, value, key, target) => {
    const camelKey = _.isArray(target) ? key : _.camelCase(key);

    acc[camelKey] = _.isObject(value) ? toCamelCase(value) : value;
  });
