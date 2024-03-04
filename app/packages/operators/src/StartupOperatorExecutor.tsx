import { useEffect } from "react";
import { executeStartupOperators } from "./operators";

let startupOperatorsExecuted = false;

export default function StartupOperatorExecutor() {
  useEffect(() => {
    if (!startupOperatorsExecuted) {
      executeStartupOperators();
      startupOperatorsExecuted = true;
    }
  }, []);

  return null;
}
