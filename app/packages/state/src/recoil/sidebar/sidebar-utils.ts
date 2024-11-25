import type { State } from "../types";

const hasNeighbor = (sink: string[], source: string[], key: string) => {
  const index = source.indexOf(key);
  const before = source[index - 1];
  const after = source[index + 1];

  return sink.includes(before) || sink.includes(after);
};

const insertFromNeighbor = (sink: string[], source: string[], key: string) => {
  if (sink.includes(key)) {
    return;
  }

  const sourceIndex = source.indexOf(key);
  const before = source[sourceIndex - 1];
  const beforeIndex = sink.indexOf(before);

  if (beforeIndex >= 0) {
    sink.splice(beforeIndex + 1, 0, key);
    return;
  }

  const after = source[sourceIndex + 1];
  const afterIndex = sink.indexOf(after);

  if (afterIndex >= 0) {
    sink.splice(afterIndex, 0, key);
    return;
  }

  sink.push(key);
  return;
};

const merge = (sink: string[], source: string[]) => {
  const missing = new Set(source.filter((key) => !sink.includes(key)));

  while (missing.size) {
    const force = ![...missing].some((name) => hasNeighbor(sink, source, name));
    for (const name of missing) {
      if (!force && !hasNeighbor(sink, source, name)) {
        continue;
      }
      insertFromNeighbor(sink, source, name);
      missing.delete(name);
    }
  }
};

export const mergeGroups = (
  sink: State.SidebarGroup[],
  source: State.SidebarGroup[]
) => {
  const mapping = Object.fromEntries(sink.map((g) => [g.name, g]));
  const configMapping = Object.fromEntries(source.map((g) => [g.name, g]));
  const sinkKeys = sink.map(({ name }) => name);
  const sourceKeys = source.map(({ name }) => name);

  merge(sinkKeys, sourceKeys);

  for (const key of sinkKeys) {
    mapping[key] = mapping[key] ?? configMapping[key];
  }
  const resolved = sinkKeys.map((g) => mapping[g] ?? configMapping[g]);
  for (const { name } of resolved) {
    const i = sourceKeys.indexOf(name);
    if (i < 0) {
      continue;
    }

    merge(mapping[name].paths || [], source[i].paths);
  }

  return resolved;
};
