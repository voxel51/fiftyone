import { describe, expect, it } from "vitest";
import { OperatorConfig } from "./operators";

describe("OperatorConfig: readOnly", () => {
  it("should default readOnly to false when no value provided", () => {
    const config = new OperatorConfig({ name: "my_op" });
    expect(config.readOnly).toBe(false);
  });

  it("should set readOnly to true when true value provided", () => {
    const config = new OperatorConfig({ name: "my_op", readOnly: true });
    expect(config.readOnly).toBe(true);
  });

  it("should set readOnly to false when false value provided", () => {
    const config = new OperatorConfig({ name: "my_op", readOnly: false });
    expect(config.readOnly).toBe(false);
  });

  it("should set readOnly correctly when constructed fromJSON", () => {
    const readOnlyTrue = OperatorConfig.fromJSON({
      name: "my_op",
      read_only: true,
    });
    expect(readOnlyTrue.readOnly).toBe(true);
    const readOnlyFalse = OperatorConfig.fromJSON({
      name: "my_op",
      read_only: false,
    });
    expect(readOnlyFalse.readOnly).toBe(false);
    const readOnlyNone = OperatorConfig.fromJSON({
      name: "my_op",
    });
    expect(readOnlyNone.readOnly).toBe(false);
  });
});
