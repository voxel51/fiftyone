import { writeFileSync } from "node:fs";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { warmKeys } from "../Grid/warming";
import { createPageSource, PAGE_SIZE } from "../host/pageSource";
import type { Order } from "../order/order";
import { type Environment, installEnvironment, type Size } from "./environment";
import { createServer, pagerFor } from "./fakeOrder";
import { mountHost } from "./mountHost";

/** A fixed round trip per request. */
const LATENCY = 100;
const STEP = 5;

let env: Environment | undefined;

afterEach(() => {
  env?.restore();
  env = undefined;
  document.body.innerHTML = "";
});

const ORDER: Order = {
  kind: "order",
  token: "token",
  mode: "INDEXED",
  total: null,
  bounds: { min: 0, max: 1, scale: "NUMBER" },
  desc: false,
  ticks: [],
};

interface Setup {
  pageSize: number;
  /** The open reads the first page (the start page then needs no request) */
  seeded: boolean;
  warm: boolean;
}

const BEFORE: Setup = { pageSize: 20, seeded: false, warm: false };
const AFTER: Setup = { pageSize: PAGE_SIZE, seeded: true, warm: true };

/**
 * Mounts a grid on an order that opens on first read, and returns the
 * requests sent by the time the first instance is on screen (the open and
 * warms in flight included) and that time; with `seek`, the same for the
 * instance a rail release that seeks there builds. Set
 * FLOODLIGHT_FILL_REPORT to a path to write the numbers there.
 */
const fill = async (
  { pageSize, seeded, warm }: Setup,
  size: Size,
  rowAspect: number,
  seek?: number,
) => {
  env = installEnvironment(size);
  const server = createServer(LATENCY);
  const fractions = new Map<string, number>();
  let opening: ReturnType<typeof server.open> | undefined;
  const open = () => (opening ??= server.open(seeded ? pageSize : undefined));
  let source = createPageSource(
    pagerFor(server, ORDER, undefined, fractions, { open, pageSize }),
  );
  const mounted = mountHost({
    rowAspect: () => rowAspect,
    sourceOf: () => source,
    onPage: (key, start, page) => {
      if (!warm) return;
      for (const next of warmKeys(key, start, page, ORDER.mode)) {
        source.warm(next);
      }
    },
  });

  const until = async (label: string) => {
    let elapsed = 0;
    while (mounted.current !== label && elapsed < 10_000) {
      await env!.tick(STEP);
      await env!.idle(2);
      elapsed += STEP;
    }
    return elapsed;
  };

  mounted.host.rebuild();
  env.resize(size);
  const opened = { ms: await until("i0"), requests: server.sent.length };
  if (seek === undefined) return opened;

  await env.tick(1000);
  await env.idle();
  const sent = server.sent.length;
  source = createPageSource(
    pagerFor(server, ORDER, { fraction: seek }, fractions, { open, pageSize }),
  );
  mounted.host.rebuild({ key: 0 });
  return { ms: await until("i1"), requests: server.sent.length - sent };
};

// the default zoom on a laptop (about 15 square samples a screen) and the
// minimum zoom on a 1600 x 900 panel (about 56)
const DEFAULT = [{ width: 1028, height: 600 }, 5] as const;
const DENSE = [{ width: 1600, height: 900 }, 10] as const;

const results: Record<string, unknown> = {};
const report = (name: string, before: object, after: object) => {
  results[name] = { before, after };
};

afterAll(() => {
  const file = process.env.FLOODLIGHT_FILL_REPORT;
  file && writeFileSync(file, JSON.stringify(results, null, 2));
});

describe(`first screen, at ${LATENCY}ms a request`, () => {
  test("opening at the default zoom", async () => {
    const before = await fill(BEFORE, ...DEFAULT);
    const after = await fill(AFTER, ...DEFAULT);
    report("default", before, after);
    expect(after.requests).toBeLessThan(before.requests);
    expect(after.ms).toBeLessThan(before.ms);
  });

  test("opening dense", async () => {
    const before = await fill(BEFORE, ...DENSE);
    const after = await fill(AFTER, ...DENSE);
    report("dense", before, after);
    expect(after.requests).toBeLessThan(before.requests);
    expect(after.ms).toBeLessThan(before.ms);
  });

  test("a rail release that seeks, dense", async () => {
    const before = await fill(BEFORE, ...DENSE, 0.5);
    const after = await fill(AFTER, ...DENSE, 0.5);
    report("seek", before, after);
    expect(after.ms).toBeLessThan(before.ms);
  });
});
