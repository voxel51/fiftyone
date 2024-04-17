import { Box } from "@mui/material";
import OperatorIO from "../OperatorIO";
import { ErrorView } from "../../../core/src/plugins/SchemaIO/components";
import { stringifyError } from "../utils";

export default function OperatorPromptOutput({ operatorPrompt, outputFields }) {
  const executorError = operatorPrompt?.executorError;
  const resolveError = operatorPrompt?.resolveError;
  const error = resolveError || executorError;
  if (!outputFields && !executorError && !resolveError) return null;
  const { result } = operatorPrompt.executor;

  return (
    <Box p={2}>
      {outputFields && (
        <OperatorIO
          type="output"
          data={result}
          schema={operatorPrompt.outputFields}
        />
      )}
      {error && (
        <ErrorView
          schema={{ view: { detailed: true } }}
          data={[
            {
              reason: "Error occurred during operator execution",
              details: stringifyError(error),
            },
          ]}
        />
      )}
    </Box>
  );
}
