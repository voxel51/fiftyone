import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { gridRailMode, isRailed } from "../Grid/railModes";
import { warmKeys } from "../Grid/warming";
import { createPageSource, PAGE_SIZE } from "../host/pageSource";
import type { Order } from "../order/order";
import { type Environment, installEnvironment } from "./environment";
import { createServer, N, pagerFor } from "./fakeOrder";
import { mountHost } from "./mountHost";

const LATENCY = 40;
const SIZE = { width: 1028, height: 600 };

let env: Environment;

beforeEach(() => {
  env = installEnvironment(SIZE);
});

afterEach(() => {
  env.restore();
  document.body.innerHTML = "";
});

const order = (scale: "NUMBER" | "ID"): Order => ({
  kind: "order",
  token: "token",
  mode: "INDEXED",
  total: null,
  // ids bound an unsorted order: hex, seconds first, as the server sends them
  bounds:
    scale === "ID"
      ? {
          min: `${"0".repeat(8)}${"a".repeat(16)}`,
          max: `000007d0${"a".repeat(16)}`,
          scale,
        }
      : { min: 0, max: 1, scale },
  desc: false,
  ticks: [],
});

const settle = async () => {
  for (let i = 0; i < 12; i++) {
    await env.tick(LATENCY);
    await env.idle();
  }
};

describe.each(["NUMBER", "ID"] as const)(
  "a rail release on an INDEXED order (%s scale)",
  (scale) => {
    test("seeks once, lands the seek page, and warms around it", async () => {
      const opened = order(scale);
      const server = createServer(LATENCY);
      const fractions = new Map<string, number>();
      let source = createPageSource(
        pagerFor(server, opened, undefined, fractions),
      );
      const mounted = mountHost({
        sourceOf: () => source,
        onPage: (key, start, page) => {
          for (const next of warmKeys(key, start, page, opened.mode)) {
            source.warm(next);
          }
        },
      });
      mounted.host.rebuild();
      env.resize(SIZE);
      await settle();
      expect(mounted.current).toBe("i0");
      expect(mounted.looker.tiles("i0")).toContain("s0");

      // a release at the middle, where nothing is loaded, plans one seek
      const mode = gridRailMode(opened, false);
      expect(isRailed(mode) && mode.kind).toBe("value");
      if (!isRailed(mode)) return;
      const plan = mode.jump(
        0.5,
        undefined,
        { fractions, sequences: new Map() },
        PAGE_SIZE,
      );
      expect(plan).toEqual({ seek: { fraction: 0.5 } });

      // the panel keys a new source by the new origin and rebuilds at key 0
      const sought = server.sent.length;
      const old = source;
      source = createPageSource(
        pagerFor(server, opened, { fraction: 0.5 }, fractions),
      );
      old.dispose();
      mounted.host.rebuild({ key: 0 });
      await settle();

      expect(mounted.current).toBe("i1");
      const shown = mounted.looker.tiles("i1");
      expect(shown).toContain(`s${N / 2}`);
      const seekRequest = server.sent[sought];
      expect(seekRequest.variables).toMatchObject({
        count: PAGE_SIZE,
        order: "token",
        seek: { fraction: 0.5 },
      });
      expect(seekRequest.signal.aborted).toBe(false);
      // the page before the seek page is fetched (warmed, then read)
      const before = server.sent
        .slice(sought)
        .find((request) => request.variables.before === String(N / 2));
      expect(before?.signal.aborted).toBe(false);
      expect(shown).toContain(`s${N / 2 - 1}`);
    });
  },
);
