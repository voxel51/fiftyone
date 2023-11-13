import OperatorBrowser from "./OperatorBrowser";
import OperatorInvocationRequestExecutor from "./OperatorInvocationRequestExecutor";
import OperatorPrompt, { OperatorViewModal } from "./OperatorPrompt";

export default function OperatorCore() {
  return (
    <>
      <OperatorBrowser />
      <OperatorInvocationRequestExecutor />
      <OperatorPrompt />
      <OperatorViewModal />
    </>
  );
}
