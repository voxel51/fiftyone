import Operator from "./Operator";
import { localRegistry, remoteRegistry } from "./OperatorRegistry";
import { resolveOperatorURI } from "./resolveOperator";

export default function getLocalOrRemoteOperator(operatorURI: string): {
  operator: Operator;
  isRemote: boolean;
} {
  const resolvedURI = resolveOperatorURI(operatorURI);

  let operator: Operator | undefined;
  let isRemote = false;

  if (localRegistry.operatorExists(resolvedURI)) {
    operator = localRegistry.getOperator(resolvedURI);
  } else if (remoteRegistry.operatorExists(resolvedURI)) {
    operator = remoteRegistry.getOperator(resolvedURI);
    isRemote = true;
  }

  if (!operator) {
    throw new Error(`Operator "${resolvedURI}" not found`);
  }

  return { operator, isRemote };
}
