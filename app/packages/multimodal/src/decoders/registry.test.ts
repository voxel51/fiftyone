import { describe, expect, it, vi } from "vitest";
import { VISUALIZATION_KIND } from "../visualization";
import { DecoderRegistry, payloadDescriptorKey } from "./registry";
import type { Decoder } from "./types";

describe("DecoderRegistry", () => {
  it("registers and finds runtime decoders", () => {
    const decoder = createDecoder("custom-decoder");
    const registry = new DecoderRegistry();

    registry.register(decoder);

    expect(registry.find(decoder.payload)).toBe(decoder);
    expect(registry.list()).toEqual([decoder]);
  });

  it("rejects duplicate payload registrations", () => {
    const registry = new DecoderRegistry();
    registry.register(createDecoder("first-decoder"));

    expect(() => registry.register(createDecoder("second-decoder"))).toThrow(
      "Decoder already registered"
    );
  });

  it("uses stable payload descriptor keys", () => {
    expect(
      payloadDescriptorKey({
        encoding: "protobuf",
        schema: "example.PointCloud",
        schemaEncoding: "protobuf",
      })
    ).toBe('["protobuf","protobuf","example.PointCloud"]');
  });
});

function createDecoder(id: string): Decoder {
  return {
    decode: vi.fn(() => ({
      attributes: {},
      visualization: {
        bytes: new Uint8Array(),
        kind: VISUALIZATION_KIND.ENCODED_IMAGE,
      },
    })),
    id,
    payload: {
      encoding: "encoding",
      schema: "schema",
      schemaEncoding: "schema-encoding",
    },
    version: "1",
  };
}
