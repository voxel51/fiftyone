import { describe, expect, it } from "vitest";
import { interpret } from "xstate";
import viewBarMachine from "./viewBarMachine";

describe("viewBarMachine", () => {
  it("should have predictableActionArguments enabled", () => {
    // This test verifies the XState v4 migration fix
    // predictableActionArguments ensures action arguments are passed consistently
    // as (context, event) which is required for XState v5 compatibility
    expect(viewBarMachine.config.predictableActionArguments).toBe(true);
  });

  it("should execute actions with predictable arguments", () => {
    const service = interpret(viewBarMachine);

    // Start the service
    service.start();

    // Verify the machine is initialized
    expect(service.initialized).toBe(true);

    // Send an UPDATE event to test action execution
    const testView: any[] = [];
    const testFieldNames: string[] = [];
    const testStageDefinitions: any[] = [];

    service.send({
      type: "UPDATE",
      view: testView,
      fieldNames: testFieldNames,
      stageDefinitions: testStageDefinitions,
      setView: () => {},
      http: {} as any,
    });

    // The machine should transition successfully with predictableActionArguments
    // After UPDATE, the machine goes from "decide" to "running" immediately
    expect(service.state.matches("running")).toBe(true);

    service.stop();
  });

  it("should have all required action handlers defined", () => {
    // Verify that custom actions are properly defined
    expect(viewBarMachine.options?.actions).toBeDefined();
    expect(viewBarMachine.options?.actions?.sendStagesUpdate).toBeDefined();
    expect(viewBarMachine.options?.actions?.submit).toBeDefined();
  });
});
