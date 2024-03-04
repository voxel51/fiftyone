import OperatorBrowser from "./OperatorBrowser";
import OperatorInvocationRequestExecutor from "./OperatorInvocationRequestExecutor";
import OperatorPrompt, { OperatorViewModal } from "./OperatorPrompt";
import StartupOperatorExecutor from "./StartupOperatorExecutor";

export default function OperatorCore() {
  return (
    <>
      <OperatorBrowser />
      <OperatorInvocationRequestExecutor />
      <StartupOperatorExecutor />
      <OperatorPrompt />
      <OperatorViewModal />
    </>
  );
}
