import { describe, expect, it } from "vitest";
import { createTaskQueue } from "./taskQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createTaskQueue", () => {
  it("resolves with each task's result", async () => {
    const enqueue = createTaskQueue();

    await expect(enqueue(async () => 1)).resolves.toBe(1);
    await expect(enqueue(async () => "two")).resolves.toBe("two");
  });

  it("does not start a task until the previous one settles", async () => {
    const enqueue = createTaskQueue();
    const first = deferred<void>();
    let secondStarted = false;

    const firstResult = enqueue(() => first.promise);
    const secondResult = enqueue(async () => {
      secondStarted = true;
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);

    first.resolve();
    await firstResult;
    await secondResult;
    expect(secondStarted).toBe(true);
  });

  it("runs tasks in submission order", async () => {
    const enqueue = createTaskQueue();
    const order: number[] = [];

    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        enqueue(async () => {
          order.push(i);
        }),
      ),
    );

    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("rejects the failing task's caller without blocking later tasks", async () => {
    const enqueue = createTaskQueue();

    const failing = enqueue(async () => {
      throw new Error("boom");
    });
    const following = enqueue(async () => "ok");

    await expect(failing).rejects.toThrow("boom");
    await expect(following).resolves.toBe("ok");
  });
});
