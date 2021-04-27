import React from "react";
import { HoverItemDiv, useHighlightHover } from "./utils";

type ActionOptionProps = {
  onClick: () => void;
  text: string;
  title?: string;
  disabled?: boolean;
};

export const ActionOption = React.memo(
  ({ onClick, text, title, disabled }: ActionOptionProps) => {
    const props = useHighlightHover(disabled);
    if (disabled) {
      return null;
    }
    return (
      <HoverItemDiv
        title={title ? title : text}
        onClick={disabled ? null : onClick}
        {...props}
      >
        {text}
      </HoverItemDiv>
    );
  }
);
