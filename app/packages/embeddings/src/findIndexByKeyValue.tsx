// a function that returns the index of an object in an array
// that has a given value for a given key
export function findIndexByKeyValue(array, key, value) {
  for (var i = 0; i < array.length; i++) {
    if (array[i][key] === value) {
      return i;
    }
  }
  return null;
}
