export { Dataset } from "./Dataset";
import { getEnvironment, RelayEnvironmentKey } from "@fiftyone/state";

export function getEnvProps() {
  return { environment: getEnvironment(), environmentKey: RelayEnvironmentKey };
}

export * as fos from "@fiftyone/state";
