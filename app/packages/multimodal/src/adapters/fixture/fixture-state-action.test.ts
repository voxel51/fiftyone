import { defineStateActionCapabilityContractTests } from "../../testing/state-action-contract";
import { createFixtureStateActionProvider } from "./fixture-state-action";

defineStateActionCapabilityContractTests({
  createSession: async (scenario) => createFixtureStateActionProvider(scenario),
  name: "fixture",
});
