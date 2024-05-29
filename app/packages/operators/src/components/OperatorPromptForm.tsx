import { Box } from "@mui/material";
import { useCallback } from "react";
import OperatorIO from "../OperatorIO";

export function OperatorPromptForm({ operatorPrompt }) {
  const setFormState = useCallback(
    (data) => {
      const formData = { ...data };
      for (const field in formData) {
        operatorPrompt.setFieldValue(field, formData[field]);
      }
    },
    [operatorPrompt]
  );

  return (
    <Box component={"form"} p={2} onSubmit={operatorPrompt.onSubmit}>
      <OperatorIO
        schema={operatorPrompt.inputFields}
        onChange={setFormState}
        data={operatorPrompt.promptingOperator.params}
        errors={operatorPrompt?.validationErrors || []}
      />
    </Box>
  );
}
