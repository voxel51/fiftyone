import Operator from "./Operator";
import { localRegistry } from "./OperatorRegistry";

/**
 * Registers a built-in operator in the local registry.
 *
 * @param OperatorType - The operator class type.
 */
export default function registerBuiltInOperator(
  OperatorType: typeof Operator
): void {
  const operator = new OperatorType("@voxel51/operators", true);
  localRegistry.register(operator);
}
