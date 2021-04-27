import React from "react";
import { ItemAction, useHighlightHover } from "./utils";

type ActionOptionProps = {
  onClick?: () => void;
  text: string;
  title?: string;
  hidden?: boolean;
  disabled?: boolean;
};

export const ActionOption = React.memo(
  ({
    onClick,
    text,
    title,
    disabled = false,
    hidden = false,
  }: ActionOptionProps) => {
    const props = useHighlightHover(disabled);
    if (hidden) {
      return null;
    }
    return (
      <ItemAction
        title={title ? title : text}
        onClick={disabled ? null : onClick}
        {...props}
      >
        {text}
      </ItemAction>
    );
  }
);
