/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { atom } from "./atom";
import { noWait, selector } from "./selector";

describe("noWait", () => {
  it("reads a pending selector as loading, then as its value", async () => {
    let resolve: (value: string) => void = () => undefined;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const sampleId = selector<string>({ key: "sampleId", get: () => pending });
    const store = createStore();
    const unsubscribe = store.sub(noWait(sampleId), () => undefined);

    expect(store.get(noWait(sampleId)).state).toBe("loading");

    resolve("sample-1");
    await pending;
    await Promise.resolve();

    const settled = store.get(noWait(sampleId));
    expect(settled.state).toBe("hasValue");
    expect(settled.contents).toBe("sample-1");
    unsubscribe();
  });

  it("reads a failing selector as an error rather than throwing", () => {
    const broken = selector<string>({
      key: "broken",
      get: () => {
        throw new Error("no sample");
      },
    });

    const result = createStore().get(noWait(broken));

    expect(result.state).toBe("hasError");
    expect(result.contents).toEqual(new Error("no sample"));
  });

  it("hands back the same state for the same input", () => {
    const count = atom({ key: "noWaitCount", default: 1 });

    expect(noWait(count)).toBe(noWait(count));
  });
});
