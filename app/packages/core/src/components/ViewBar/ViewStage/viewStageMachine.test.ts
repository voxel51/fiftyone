import { describe, expect, it } from "vitest";
import viewStageMachine from "./viewStageMachine";

describe("viewStageMachine", () => {
  it("should have predictableActionArguments enabled", () => {
    // This test verifies the XState v4 migration fix
    expect(viewStageMachine.config.predictableActionArguments).toBe(true);
  });

  it("should have all required action handlers defined", () => {
    // Verify that custom actions are properly defined
    expect(viewStageMachine.options?.actions).toBeDefined();
    expect(viewStageMachine.options?.actions?.focusInput).toBeDefined();
    expect(viewStageMachine.options?.actions?.blurInput).toBeDefined();
  });
});
