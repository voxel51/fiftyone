import { describe, expect, it } from "vitest";
import viewStageParameterMachine from "./viewStageParameterMachine";

describe("viewStageParameterMachine", () => {
  it("should have predictableActionArguments enabled", () => {
    // This test verifies the XState v4 migration fix
    expect(viewStageParameterMachine.config.predictableActionArguments).toBe(true);
  });

  it("should have all required action handlers defined", () => {
    // Verify that custom actions are properly defined
    expect(viewStageParameterMachine.options?.actions).toBeDefined();
    expect(viewStageParameterMachine.options?.actions?.blurInput).toBeDefined();
    expect(viewStageParameterMachine.options?.actions?.focusInput).toBeDefined();
  });
});
