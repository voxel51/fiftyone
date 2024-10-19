import Operator from "./Operator";
import { localRegistry, remoteRegistry } from "./OperatorRegistry";

export default function listLocalAndRemoteOperators(): {
  localOperators: Operator[];
  remoteOperators: Operator[];
  allOperators: Operator[];
} {
  const localOperators = localRegistry.listOperators();
  const remoteOperators = remoteRegistry.listOperators();

  return {
    localOperators,
    remoteOperators,
    allOperators: [...localOperators, ...remoteOperators],
  };
}
