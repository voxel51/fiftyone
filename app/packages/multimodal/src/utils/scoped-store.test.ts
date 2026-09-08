import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimestampLruScopedStore } from "./scoped-store";

interface Value {
  readonly name: string;
}

afterEach(() => vi.restoreAllMocks());

describe("timestamp-LRU scoped store", () => {
  it("layers fallback and scoped values while evicting the oldest timestamp", () => {
    const storage = memoryStorage();
    const store = createStore(storage, 2);
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now++);

    store.updateFallback(() => ({ name: "fallback" }));
    store.updateScope("scope-a", () => ({ name: "a" }));
    store.updateScope("scope-b", () => ({ name: "b" }));
    now = 5_000;
    store.updateScope("scope-a", (current) => ({
      name: `${current?.name}-touched`,
    }));
    store.updateScope("scope-c", () => ({ name: "c" }));

    expect(store.readFallback()).toEqual({ name: "fallback" });
    expect(store.readScope("scope-a")).toEqual({ name: "a-touched" });
    expect(store.readScope("scope-b")).toBeNull();
    expect(store.readScope("scope-c")).toEqual({ name: "c" });
  });

  it("sanitizes corrupt fields and notices external storage replacement", () => {
    const storage = memoryStorage();
    const store = createStore(storage, 2);
    store.updateScope("scope-a", () => ({ name: "a" }));

    storage.setItem(
      "test.scoped-store",
      JSON.stringify({
        fallback: { name: 7 },
        scopes: {
          "scope-a": { name: 7, updatedAtMs: "yesterday" },
          "scope-b": { name: "b", updatedAtMs: 10 },
        },
        version: 1,
      }),
    );

    expect(store.readFallback()).toBeNull();
    expect(store.readScope("scope-a")).toBeNull();
    expect(store.readScope("scope-b")).toEqual({ name: "b" });
  });

  it("fails closed when storage reads and writes throw", () => {
    const store = createStore(
      {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      2,
    );

    expect(store.readScope("scope-a")).toBeNull();
    expect(() =>
      store.updateScope("scope-a", () => ({ name: "a" })),
    ).not.toThrow();
  });
});

function createStore(
  storage: ReturnType<typeof memoryStorage>,
  maxScopes: number,
) {
  return createTimestampLruScopedStore<Value, Value>({
    fallback: {
      location: { field: "fallback" },
      sanitize: sanitizeValue,
      serialize: (value) => ({ ...value }),
    },
    key: "test.scoped-store",
    maxScopes,
    sanitizeScope: sanitizeValue,
    scopeField: "scopes",
    serializeScope: (value) => ({ ...value }),
    storage: () => storage,
    version: 1,
  });
}

function sanitizeValue(value: unknown): Value | null {
  if (typeof value !== "object" || value === null) return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? { name } : null;
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}
