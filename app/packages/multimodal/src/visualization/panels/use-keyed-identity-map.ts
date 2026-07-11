import { useRef } from "react";

interface KeyedIdentityEntry<Out> {
  inputs: readonly unknown[];
  output: Out;
}

/**
 * Maps `items` to derived objects while preserving output identity for every
 * item whose `inputs` are shallow-equal to the previous render, and the
 * array's own identity when no element changed.
 *
 * This is the identity discipline that lets memoized scene children skip
 * reconciliation: upstream streams already keep per-topic frame identity
 * stable across unrelated ticks, and this hook carries that stability through
 * derived per-layer wrappers (which would otherwise be rebuilt — new objects,
 * new closures — on every render of the owning component).
 *
 * `inputs` must enumerate everything `build` reads for that item: values it
 * embeds AND values its closures capture. Prefer per-item derived inputs over
 * global ones (e.g. "is THIS layer hovered", not the whole hover state) so a
 * change touches only the affected item. Keys must be unique per item.
 *
 * The cache is a render-phase ref mutation: idempotent for equal inputs, so
 * StrictMode double-renders reuse the first render's outputs.
 */
export function useKeyedIdentityMap<Item, Out>(
  items: readonly Item[],
  options: {
    readonly build: (item: Item, index: number) => Out;
    readonly inputs: (item: Item, index: number) => readonly unknown[];
    readonly key: (item: Item, index: number) => string;
  },
): readonly Out[] {
  const cacheRef = useRef(new Map<string, KeyedIdentityEntry<Out>>());
  const lastArrayRef = useRef<readonly Out[] | null>(null);

  const cache = cacheRef.current;
  const seen = new Set<string>();
  const next = items.map((item, index) => {
    const key = options.key(item, index);
    seen.add(key);
    const inputs = options.inputs(item, index);
    const entry = cache.get(key);
    if (entry && shallowEqualInputs(entry.inputs, inputs)) {
      return entry.output;
    }
    const output = options.build(item, index);
    cache.set(key, { inputs, output });
    return output;
  });
  for (const key of cache.keys()) {
    if (!seen.has(key)) {
      cache.delete(key);
    }
  }

  const last = lastArrayRef.current;
  if (
    last &&
    last.length === next.length &&
    next.every((output, index) => output === last[index])
  ) {
    return last;
  }
  lastArrayRef.current = next;
  return next;
}

function shallowEqualInputs(
  first: readonly unknown[],
  second: readonly unknown[],
): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => Object.is(value, second[index]))
  );
}
