import Operator from "./Operator";
import { localRegistry } from "./OperatorRegistry";

/**
 * Registers an operator to the local registry.
 *
 * @param OperatorType - The class of the operator to be registered.
 * @param pluginName - The name of the plugin to which the operator belongs.
 */
export default function registerOperator(
  OperatorType: typeof Operator,
  pluginName: string
): void {
  const operator = new OperatorType(pluginName);
  localRegistry.register(operator);
}
