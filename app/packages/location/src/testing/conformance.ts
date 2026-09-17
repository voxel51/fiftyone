/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { AdapterHarness } from "./harness";

export interface ConformanceCase {
  name: string;
  run: (harness: AdapterHarness) => void;
}

const assert = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message);
};

/**
 * The contract every adapter must satisfy, framework-free so each adapter's
 * own test file can drive it. Two passing implementations is what makes a
 * third mechanical — and stops the interface from growing router-shaped.
 */
export const CONFORMANCE_CASES: ConformanceCase[] = [
  {
    name: "get returns the current href",
    run: ({ adapter }) => {
      assert(adapter.get() === "/", `expected "/", got "${adapter.get()}"`);
    },
  },
  {
    name: "push moves the location",
    run: ({ adapter }) => {
      adapter.push("/datasets/quickstart");
      assert(
        adapter.get() === "/datasets/quickstart",
        `push did not move: "${adapter.get()}"`,
      );
    },
  },
  {
    name: "push adds one history entry",
    run: (harness) => {
      const before = harness.depth();
      harness.adapter.push("/datasets/quickstart");
      assert(
        harness.depth() === before + 1,
        `expected depth ${before + 1}, got ${harness.depth()}`,
      );
    },
  },
  {
    name: "replace adds no history entry",
    run: (harness) => {
      const before = harness.depth();
      harness.adapter.replace("/datasets/quickstart");
      assert(
        harness.depth() === before,
        `replace grew history to ${harness.depth()}`,
      );
    },
  },
  {
    name: "subscribe fires on the adapter's own writes",
    run: ({ adapter }) => {
      let calls = 0;
      const unsubscribe = adapter.subscribe(() => {
        calls += 1;
      });
      adapter.push("/datasets/a");
      adapter.replace("/datasets/b");
      unsubscribe();
      assert(calls === 2, `expected 2 notifications, got ${calls}`);
    },
  },
  {
    name: "subscribe fires on back",
    run: (harness) => {
      harness.adapter.push("/datasets/a");
      let calls = 0;
      const unsubscribe = harness.adapter.subscribe(() => {
        calls += 1;
      });
      harness.back();
      unsubscribe();
      assert(calls === 1, `expected 1 notification, got ${calls}`);
    },
  },
  {
    name: "unsubscribe stops notifications",
    run: ({ adapter }) => {
      let calls = 0;
      adapter.subscribe(() => {
        calls += 1;
      })();
      adapter.push("/datasets/a");
      assert(calls === 0, `expected no notifications, got ${calls}`);
    },
  },
  {
    name: "back restores the previous href",
    run: (harness) => {
      const original = harness.adapter.get();
      harness.adapter.push("/datasets/quickstart/samples/abc");
      harness.back();
      assert(
        harness.adapter.get() === original,
        `back landed on "${harness.adapter.get()}"`,
      );
    },
  },
  {
    name: "replace is not reachable by back",
    run: (harness) => {
      harness.adapter.push("/datasets/a");
      harness.adapter.replace("/datasets/b");
      harness.back();
      assert(
        harness.adapter.get() === "/",
        `back landed on "${harness.adapter.get()}" instead of the entry before the replace`,
      );
    },
  },
];
