import { describe, expect, it } from "vitest";
import { deferred, flush } from "./persistTestHarness";
import { enqueuePersist } from "./persistQueue";

describe("enqueuePersist", () => {
  it("starts a persist only after the previous one for the engine settled", async () => {
    const engine = {};
    const first = deferred<string>();
    const order: string[] = [];

    const p1 = enqueuePersist(engine, async () => {
      order.push("start-1");
      const value = await first.promise;
      order.push("end-1");
      return value;
    });
    const p2 = enqueuePersist(engine, async () => {
      order.push("start-2");
      return "two";
    });

    await flush();
    expect(order).toEqual(["start-1"]);

    first.resolve("one");
    expect(await p1).toBe("one");
    expect(await p2).toBe("two");
    expect(order).toEqual(["start-1", "end-1", "start-2"]);
  });

  it("keeps draining after a rejected persist", async () => {
    const engine = {};

    const p1 = enqueuePersist(engine, async () => {
      throw new Error("412");
    });
    const p2 = enqueuePersist(engine, async () => "ok");

    await expect(p1).rejects.toThrow("412");
    expect(await p2).toBe("ok");
  });

  it("chains per engine, so one engine's persist does not block another's", async () => {
    const first = deferred<void>();
    const order: string[] = [];

    const blocked = enqueuePersist({}, async () => {
      order.push("a-start");
      await first.promise;
    });
    const other = enqueuePersist({}, async () => {
      order.push("b-start");
    });

    await other;
    expect(order).toEqual(["a-start", "b-start"]);

    first.resolve();
    await blocked;
  });
});
