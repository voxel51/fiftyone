import Operator from "./Operator";
import ExecutionContext from "./ExecutionContext";
import types from "../../types";
import { localRegistry } from "./OperatorRegistry";

/**
 * Resolves local placements for operators within the given execution context.
 *
 * @param ctx - The execution context.
 * @returns An array of local placements, each containing an operator, placement, and isRemote flag.
 */
export default async function resolveLocalPlacements(
  ctx: ExecutionContext
): Promise<
  { operator: Operator; placement: types.Placement; isRemote: boolean }[]
> {
  const localOperators = localRegistry.listOperators();
  const localPlacements: {
    operator: Operator;
    placement: types.Placement;
    isRemote: boolean;
  }[] = [];

  for (const operator of localOperators) {
    const placement = await operator.resolvePlacement(ctx);
    if (placement) {
      localPlacements.push({ operator, placement, isRemote: false });
    }
  }

  return localPlacements;
}
