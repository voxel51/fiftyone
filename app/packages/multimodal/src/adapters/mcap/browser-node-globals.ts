import { Buffer } from "buffer";

// Make Buffer available in worker, too
const globals = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

globals.Buffer ??= Buffer;
