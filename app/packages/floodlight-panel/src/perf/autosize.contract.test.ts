import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { VALIDATE_TIMEOUT } from "../host/createHost";
import { type Environment, installEnvironment } from "./environment";
import { ROW_ASPECT_RATIO } from "./mount";
import { mountHost } from "./mountHost";

const SIZE = { width: 1028, height: 600 };
// a first fill holds a third: 1000 bytes, ten items of 100
const BUDGET = 3000;
const LIGHT = 1;
const HEAVY = 100;

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

/**
 * A host whose builds lay out at `zoom.value` and whose items weigh
 * `bytes.value`; a rejection recommends a zoom and rebuilds there, as the
 * panel does.
 */
const setup = (weight: number) => {
  const zoom = { value: ROW_ASPECT_RATIO };
  const bytes = { value: weight };
  const mounted = mountHost({
    config: { maxItemsSizeBytes: BUDGET },
    rowAspect: () => zoom.value,
    size: () => Promise.resolve(bytes.value),
    onRejected: (recommended) => {
      zoom.value = recommended;
      queueMicrotask(() => mounted.host.rebuild());
    },
  });
  return Object.assign(mounted, { bytes, zoom });
};

const rejected = (log: string[]) =>
  log.filter((entry) => entry.startsWith("reject")).map((e) => e.slice(7));

describe("host contracts: auto-sizing", () => {
  test("a first build over budget is never revealed; the valid rebuild is", async () => {
    const mounted = setup(HEAVY);
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();

    expect(rejected(mounted.log)).toContain("i0");
    expect(mounted.log).toContain("dispose i0");
    expect(mounted.zoom.value).toBeLessThan(ROW_ASPECT_RATIO);
    expect(mounted.revealed).toEqual([mounted.current]);
    expect(rejected(mounted.log)).not.toContain(mounted.current);
    expect(mounted.container.children).toHaveLength(1);
  });

  test("a build within budget is revealed as it is", async () => {
    const mounted = setup(LIGHT);
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();

    expect(rejected(mounted.log)).toEqual([]);
    expect(mounted.revealed).toEqual(["i0"]);
  });

  test("a rebuild over budget keeps the visible instance until a valid one", async () => {
    const mounted = setup(LIGHT);
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();
    expect(mounted.current).toBe("i0");

    mounted.bytes.value = HEAVY;
    mounted.host.rebuild();
    await env.idle(2);
    expect(rejected(mounted.log)).toContain("i1");
    expect(mounted.log).toContain("dispose i1");
    expect(mounted.current).toBe("i0");

    await env.idle();
    expect(mounted.revealed).toEqual(["i0", mounted.current]);
    expect(rejected(mounted.log)).not.toContain(mounted.current);
    expect(mounted.zoom.value).toBeLessThan(ROW_ASPECT_RATIO);
  });

  test("an instance whose sizes never arrive is revealed at the timeout", async () => {
    const mounted = mountHost({
      config: { maxItemsSizeBytes: BUDGET },
      size: () => new Promise(() => {}),
    });
    mounted.host.rebuild();
    env.resize(SIZE);
    await env.idle();
    expect(mounted.log).toEqual(["build i0", "load i0"]);
    expect(mounted.current).toBeUndefined();

    await env.tick(VALIDATE_TIMEOUT);
    expect(mounted.current).toBe("i0");
  });
});
