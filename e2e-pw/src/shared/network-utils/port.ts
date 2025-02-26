import { createConnection } from "net";

/**
 * Checks if a port is available by trying to connect to it.
 * Returns a Promise that resolves to true if the port appears available,
 * or false if a connection can be made (indicating that the port is in use).
 *
 * @param port - The port number to check.
 */
async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const host = "127.0.0.1";
    const socket = createConnection({ port, host });
    let resolved = false;

    // If a connection is established, then something is listening on that port.
    socket.once("connect", () => {
      resolved = true;
      socket.destroy();
      resolve(false); // Port is in use.
    });

    // If an error occurs, check its type.
    socket.once("error", (err: { code: string }) => {
      if (resolved) return;
      // ECONNREFUSED means nothing is listening on that port.
      if (err.code === "ECONNREFUSED") {
        resolved = true;
        resolve(true); // Port is available.
      } else {
        resolved = true;
        reject(err);
      }
    });

    // In case the connection hangs, set a timeout.
    socket.setTimeout(1000, () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(true);
      }
    });
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
  console.log("Checking port availability:", port, "timeout:", timeout);
  const checkInterval = timeout > 5000 ? 5000 : timeout;
  const startTime = Date.now();

  while (true) {
    const available = await checkPort(port);
    if (available) {
      // Port appears available.
      console.log(`Port ${port} is available.`);
      return;
    }

    // If the overall timeout has been exceeded, reject.
    if (Date.now() - startTime >= timeout) {
      throw new Error(`Port ${port} is still in use after ${timeout} ms.`);
    }

    // Wait for the next check interval.
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}
