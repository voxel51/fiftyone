import { ExecutionContext } from "@fiftyone/operators";

export default function useDebugger() {
  return {
    captureExecutionDetails(ctx: ExecutionContext) {
      // Capture execution details
      console.log(ctx);
    },
  };
}
