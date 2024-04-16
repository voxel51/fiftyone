import OperatorBrowser from "./OperatorBrowser";
import OperatorInvocationRequestExecutor from "./OperatorInvocationRequestExecutor";
import OperatorPrompt from "./OperatorPrompt";
import OperatorViewModal from "./OperatorPrompt/OperatorViewModal";

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
