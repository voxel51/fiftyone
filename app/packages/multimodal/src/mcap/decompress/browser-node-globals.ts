import { Buffer } from "buffer";

const globals = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};

globals.Buffer ??= Buffer;
