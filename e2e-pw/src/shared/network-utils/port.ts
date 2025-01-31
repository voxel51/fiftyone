import { createServer } from "net";

async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port);
  });
}

/**
 * Resolves if the port is available within the specified timeout.
 * If it's in use, keeps checking every 5 seconds for up to 1 minute (by default).
 * Rejects if the port remains in use after the timeout.
 *
 * @param port - Port to check.
 * @param timeout - Timeout in milliseconds (default 60000).
 */
export async function assertPortAvailableOrWaitWithTimeout(
  port: number,
  timeout = 60000
): Promise<void> {
  const start = Date.now();
  const interval = 5000;

  while (Date.now() - start < timeout) {
    const available = await checkPort(port);
    if (available) {
      return; // Resolve immediately if port is free
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Port ${port} is still in use after ${timeout} ms`);
}
