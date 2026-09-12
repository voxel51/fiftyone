import { scrollable } from "@fiftyone/components";
import {
  Align,
  Clickable,
  Icon,
  IconName,
  Justify,
  Orientation,
  Size,
  Spacing,
  Stack,
  TextColor,
} from "@voxel51/voodo";
import { CSSProperties } from "react";
import { OperatorPromptType } from "../types";
import { getOperatorPromptConfigs } from "../utils";
import OperatorPromptBody from "./OperatorPromptBody";
import OperatorPromptFooter from "./OperatorPromptFooter";
import OperatorPromptHeader from "./OperatorPromptHeader";

export default function OperatorPromptFrame(props: {
  prompt: OperatorPromptType;
  dataCyPrefix: string;
  contentStyle?: CSSProperties;
}) {
  const { prompt, dataCyPrefix, contentStyle } = props;
  const { title, ...otherConfigs } = getOperatorPromptConfigs(prompt);

  return (
    <>
      <Clickable
        onClick={prompt.close}
        style={{ position: "absolute", top: 0, right: 0, padding: 8 }}
      >
        <Icon
          name={IconName.Close}
          size={Size.Sm}
          color={TextColor.Secondary}
        />
      </Clickable>
      <Stack style={{ padding: 8 }}>
        <OperatorPromptHeader title={title} />
      </Stack>
      <div
        data-cy={`${dataCyPrefix}-content`}
        style={{ overflow: "auto", ...contentStyle }}
        className={scrollable}
      >
        <OperatorPromptBody operatorPrompt={prompt} />
      </div>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        justify={Justify.Center}
        align={Align.Center}
        data-cy={`${dataCyPrefix}-footer`}
        style={{ paddingTop: 8, paddingBottom: 8 }}
      >
        <OperatorPromptFooter {...otherConfigs} />
      </Stack>
    </>
  );
}
