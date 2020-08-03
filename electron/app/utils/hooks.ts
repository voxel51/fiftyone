// intended usage:
// [someSet, setSomeSetItem] = wrapSetWithItemSetter(useState(new Set()))
export const wrapSetWithItemSetter: (
  pair: [Set, (newSet: Set) => void]
) => [Set, (item, value: boolean) => void] = ([source, setter]) => {
  if (!(source instanceof Set)) {
    throw new TypeError("source is not a Set");
  }

  const wrapper = (item, inSet) => {
    let copy;
    if (inSet && !source.has(item)) {
      copy = new Set(source);
      copy.add(item);
    } else if (!inSet && source.has(item)) {
      copy = new Set(source);
      copy.delete(item);
    }
    if (copy) {
      setter(copy);
    }
  };

  return [source, wrapper];
};
