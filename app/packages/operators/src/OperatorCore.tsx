import OperatorBrowser from "./OperatorBrowser";
import OperatorInvocationRequestExecutor from "./OperatorInvocationRequestExecutor";
import OperatorPrompt, { OperatorViewModal } from "./OperatorPrompt";
import { useOperatorPlacementsResolver } from "./hooks";

export default function OperatorCore() {
  useOperatorPlacementsResolver();

  return (
    <>
      <OperatorBrowser />
      <OperatorInvocationRequestExecutor />
      <OperatorPrompt />
      <OperatorViewModal />
    </>
  );
}
