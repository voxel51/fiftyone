/** Public deterministic format adapter for contract and performance tests. */
export { createFixtureFormatAdapter } from "./fixture-adapter";
export type { FixtureAdapterOptions } from "./fixture-adapter";
/** Reference state/action provider for the capability contract tests. */
export { createFixtureStateActionProvider } from "./fixture-state-action";
export type {
  FixtureStateActionProvider,
  StateActionScenario,
  StateActionScenarioFeature,
} from "./fixture-state-action";
