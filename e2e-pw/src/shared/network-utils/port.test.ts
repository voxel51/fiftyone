import { createServer, Server } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reserveWorkerPort } from "./port";

// a port whose connects are reset, as a listener mid-shutdown resets them
const resetting = vi.hoisted(() => ({ port: -1 }));

vi.mock("net", async (importOriginal) => {
  const net = await importOriginal<typeof import("net")>();
  return {
    ...net,
    createConnection: (options: { port: number; host: string }) => {
      if (options.port !== resetting.port) {
        return net.createConnection(options);
      }
      const socket = new net.Socket();
      process.nextTick(() =>
        socket.emit(
          "error",
          Object.assign(new Error("reset"), { code: "ECONNRESET" }),
        ),
      );
      return socket;
    },
  };
});

// well clear of the windows any real worker count reaches, so an e2e run on
// the same machine cannot influence these
const TEST_PARALLEL_INDEX = 90;
const WINDOW_FIRST = 3050 + TEST_PARALLEL_INDEX * 10;

const listening: Server[] = [];

const occupy = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      listening.push(server);
      resolve();
    });
  });

afterEach(async () => {
  resetting.port = -1;
  await Promise.all(
    listening.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe("reserveWorkerPort", () => {
  it("gives each parallel index a disjoint window", async () => {
    const [a, b] = await Promise.all([
      reserveWorkerPort(TEST_PARALLEL_INDEX),
      reserveWorkerPort(TEST_PARALLEL_INDEX + 1),
    ]);

    expect(a).toBe(WINDOW_FIRST);
    expect(b).toBe(WINDOW_FIRST + 10);
  });

  it("skips ports still held inside its own window", async () => {
    await occupy(WINDOW_FIRST);
    await occupy(WINDOW_FIRST + 1);

    expect(await reserveWorkerPort(TEST_PARALLEL_INDEX)).toBe(WINDOW_FIRST + 2);
  });

  it("throws when the whole window is held", async () => {
    for (let port = WINDOW_FIRST; port <= WINDOW_FIRST + 9; port++) {
      await occupy(port);
    }

    await expect(reserveWorkerPort(TEST_PARALLEL_INDEX)).rejects.toThrow(
      `no free port in [${WINDOW_FIRST}, ${WINDOW_FIRST + 9}]`,
    );
  });

  it("skips a port whose listener is still shutting down", async () => {
    resetting.port = WINDOW_FIRST;

    expect(await reserveWorkerPort(TEST_PARALLEL_INDEX)).toBe(WINDOW_FIRST + 1);
  });
});
