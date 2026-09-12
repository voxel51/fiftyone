import { Card } from "@voxel51/voodo";
import { useCallback, useEffect } from "react";
import OperatorPromptFrame from "../components/OperatorPromptFrame";
import { OperatorPromptPropsType } from "../types";

export default function OperatorFullScreenPrompt(
  props: OperatorPromptPropsType,
) {
  const { prompt } = props;

  const keyDownHandler = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") prompt.close();
    },
    [prompt],
  );

  useEffect(() => {
    document.addEventListener("keydown", keyDownHandler);
    return () => {
      document.removeEventListener("keydown", keyDownHandler);
    };
  }, [keyDownHandler]);

  return (
    <Card
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        borderRadius: 0,
      }}
      data-cy="operators-prompt-full-screen"
    >
      <OperatorPromptFrame
        prompt={prompt}
        dataCyPrefix="operators-prompt-full-screen"
        contentStyle={{ maxHeight: "calc(100vh - 120px)" }}
      />
    </Card>
  );
}
