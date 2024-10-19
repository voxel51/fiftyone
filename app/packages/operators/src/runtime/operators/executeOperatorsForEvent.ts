import executeOperator from "./executeOperator";
import listLocalAndRemoteOperators from "./listLocalAndRemoteOperators";

/**
 * Executes operators for a given event.
 *
 * @param event - The event name, either "onStartup" or "onDatasetOpen".
 */
export default async function executeOperatorsForEvent(
  event: "onStartup" | "onDatasetOpen"
): Promise<void> {
  const { allOperators } = listLocalAndRemoteOperators();

  for (const operator of allOperators) {
    if (operator.config.canExecute && operator.config[event] === true) {
      await executeOperator(operator.uri);
    }
  }
}
