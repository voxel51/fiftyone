import OperatorPalette from "../OperatorPalette";
import OperatorPromptBody from "../components/OperatorPromptBody";
import { PaletteContentContainer } from "../styled-components";
import { OperatorPromptPropsType } from "../types";
import { getOperatorPromptConfigs } from "../utils";

export default function OperatorModalPrompt(props: OperatorPromptPropsType) {
  const { prompt } = props;
  const promptConfig = getOperatorPromptConfigs(prompt);
  return (
    <OperatorPalette
      {...promptConfig}
      submitOnControlEnter
      dialogProps={{ PaperProps: { "data-cy": "operators-prompt-modal" } }}
    >
      <PaletteContentContainer>
        <OperatorPromptBody operatorPrompt={prompt} />
      </PaletteContentContainer>
    </OperatorPalette>
  );
}
