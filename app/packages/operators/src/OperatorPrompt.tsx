import { Button } from "@fiftyone/components";
import { scrollbarStyles } from "@fiftyone/utilities";
import { Box } from "@mui/material";
import { createPortal } from "react-dom";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import OperatorIO from "./OperatorIO";
import {
  showOperatorPromptSelector,
  useOperatorPrompt,
  useShowOperatorIO,
} from "./state";

// todo: use plugin component
import ErrorView from "../../core/src/plugins/SchemaIO/components/ErrorView";
import BaseStylesProvider from "./BaseStylesProvider";
import { stringifyError } from "./utils";

const PromptContainer = styled.div`
  position: absolute;
  top: 5rem;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  z-index: 999;
`;

const PromptModal = styled.div`
  align-self: stretch;
  background: ${({ theme }) => theme.background.level2};
  max-width: 90vw;
  min-width: 50%;
  width: auto;
  padding: 1rem;
  max-height: calc(80vh);
  overflow: auto;
  ${scrollbarStyles}
`;

const ButtonsContainer = styled.div`
  display: flex;
  justify-content: flex-end;
`;

export default function OperatorPrompt() {
  const show = useRecoilValue(showOperatorPromptSelector);
  if (show) {
    return (
      <BaseStylesProvider>
        <ActualOperatorPrompt />
      </BaseStylesProvider>
    );
  } else {
    return null;
  }
}

function ActualOperatorPrompt() {
  const operatorPrompt = useOperatorPrompt();
  const showResultOrError =
    operatorPrompt.hasResultOrError ||
    operatorPrompt.executorError ||
    operatorPrompt.resolveError;

  return createPortal(
    <PromptContainer>
      <PromptModal ref={operatorPrompt.containerRef}>
        {operatorPrompt.showPrompt && (
          <Prompting operatorPrompt={operatorPrompt} />
        )}
        {operatorPrompt.isExecuting && <div>Executing...</div>}
        {showResultOrError && (
          <ResultsOrError
            operatorPrompt={operatorPrompt}
            outputFields={operatorPrompt.outputFields}
          />
        )}
      </PromptModal>
    </PromptContainer>,
    document.body
  );
}

function Prompting({ operatorPrompt }) {
  return (
    <Box>
      <Box sx={{ pb: 2 }}>
        <form onSubmit={operatorPrompt.onSubmit}>
          <OperatorIO
            schema={operatorPrompt.inputFields}
            onChange={(data) => {
              const formData = data;
              for (const field in formData) {
                operatorPrompt.setFieldValue(field, formData[field]);
              }
            }}
            data={operatorPrompt.promptingOperator.params}
            errors={operatorPrompt?.validationErrors || []}
          />
        </form>
      </Box>
      <ButtonsContainer>
        <Button onClick={operatorPrompt.cancel} style={{ marginRight: "8px" }}>
          Cancel
        </Button>
        <Button onClick={operatorPrompt.execute}>Execute</Button>
      </ButtonsContainer>
    </Box>
  );
}

export function OperatorViewModal() {
  const io = useShowOperatorIO();
  if (!io.visible) return null;

  return createPortal(
    <BaseStylesProvider>
      <PromptContainer>
        <PromptModal>
          <Box>
            <Box sx={{ pb: 2 }}>
              <OperatorIO
                schema={io.schema}
                data={io.data || {}}
                type={io.type}
              />
            </Box>
            {/* {io.showButtons && (
            <ButtonsContainer>
              <Button onClick={operatorPrompt.cancel} style={{ marginRight: "8px" }}>
                Cancel
              </Button>
              <Button onClick={operatorPrompt.execute}>Execute</Button>
            </ButtonsContainer>
          )}  */}
          </Box>
        </PromptModal>
      </PromptContainer>
    </BaseStylesProvider>,
    document.body
  );
}

function ResultsOrError({ operatorPrompt, outputFields }) {
  const executorError = operatorPrompt?.executorError;
  const resolveError = operatorPrompt?.resolveError;
  const error = resolveError || executorError;
  if (!outputFields && !executorError && !resolveError) return null;
  const { result } = operatorPrompt.executor;

  return (
    <Box>
      {outputFields && (
        <OperatorIO
          type="output"
          data={result}
          schema={operatorPrompt.outputFields}
          onChange={() => {}}
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
      <ButtonsContainer>
        <Button onClick={() => operatorPrompt.close()}>Close</Button>
      </ButtonsContainer>
    </Box>
  );
}
