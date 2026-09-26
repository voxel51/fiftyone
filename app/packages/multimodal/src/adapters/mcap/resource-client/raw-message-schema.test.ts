import { Root } from "protobufjs";
import descriptor from "protobufjs/ext/descriptor";
import { describe, expect, it } from "vitest";
import { rawMessageSchema } from "./raw-message-schema";

describe("declared message schemas", () => {
  it("includes recursive message references, repeated fields and enums without recursive expansion", () => {
    const root = Root.fromJSON({
      nested: {
        Node: {
          fields: {
            id: { id: 1, type: "uint64" },
            children: { id: 2, type: "Node", rule: "repeated" },
            state: { id: 3, type: "State" },
          },
        },
        State: { values: { UNKNOWN: 0, MOVING: 1 } },
      },
    });
    const data = descriptor.FileDescriptorSet.encode(
      (
        root as unknown as {
          toDescriptor(
            version: string,
          ): Parameters<typeof descriptor.FileDescriptorSet.encode>[0];
        }
      ).toDescriptor("proto3"),
    ).finish();
    const schema = {
      id: 1,
      type: "Schema" as const,
      name: "Node",
      encoding: "protobuf",
      data,
    };
    const result = rawMessageSchema(schema);
    expect(result?.truncated).toBeUndefined();
    const parsed = JSON.parse(result?.text ?? "{}");
    expect(parsed.types.Node.fields.children).toEqual({
      type: "Node",
      id: 2,
      repeated: true,
    });
    expect(parsed.types.Node.fields.id.type).toBe("uint64");
    expect(parsed.types.State.enum.MOVING).toBe(1);
    expect(rawMessageSchema(schema)).toBe(result);
  });
  it("uses declared JSON and ROS text and reports missing or unreadable declarations honestly", () => {
    const schema = (encoding: string, text: string) => ({
      id: 1,
      type: "Schema" as const,
      name: "Pose",
      encoding,
      data: new TextEncoder().encode(text),
    });
    expect(
      rawMessageSchema(
        schema(
          "jsonschema",
          '{"type":"object","properties":{"x":{"type":"number"}}}',
        ),
      )?.text,
    ).toContain('"x"');
    expect(
      rawMessageSchema(schema("ros1msg", "float64 x\nfloat64 y"))?.text,
    ).toContain("float64 y");
    expect(rawMessageSchema(schema("protobuf", "invalid"))).toBeUndefined();
    expect(rawMessageSchema(schema("jsonschema", "{"))).toBeUndefined();
    expect(rawMessageSchema(undefined)).toBeUndefined();
  });
  it("bounds schema text and explicitly marks truncation", () => {
    const result = rawMessageSchema({
      id: 1,
      type: "Schema",
      name: "Large",
      encoding: "ros2msg",
      data: new TextEncoder().encode("float64 x\n".repeat(10000)),
    });
    expect(result?.truncated).toBe(true);
    expect(result?.text.length).toBeLessThanOrEqual(65536);
  });
});
