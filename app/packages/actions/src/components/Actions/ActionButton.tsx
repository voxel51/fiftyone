import {
  IconAction,
  type IconInput,
  Size,
  Spinner,
  TextAction,
  Tooltip,
} from "@voxel51/voodo";
import React from "react";
import styles from "./ActionButton.module.css";

type ActionButtonProps = {
  highlight?: boolean;
  icon: IconInput;
  /** Shows a spinner in place of the icon, and ignores clicks */
  loading?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /** A count beside the icon */
  text?: string;
  title: string;
  tooltipPlacement?: "top" | "bottom";
  disabled?: boolean;
  "data-cy"?: string;
};

const Loading = () => <Spinner size={Size.Sm} />;

/** A toolbar action: an icon, and an optional count, quiet until hovered or on. */
const ActionButton = ({
  disabled,
  highlight,
  icon,
  loading,
  onClick,
  text,
  title,
  tooltipPlacement = "top",
  ...props
}: ActionButtonProps) => {
  const shared = {
    ...props,
    "aria-pressed": highlight,
    className: [styles.action, highlight ? styles.highlight : undefined]
      .filter(Boolean)
      .join(" "),
    disabled,
    // the overlay's action row is draggable; a press here must not drag it
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onClick: loading ? undefined : onClick,
  };
  const shown = loading ? Loading : icon;

  return (
    <Tooltip anchor={tooltipPlacement} content={title} portal>
      {text ? (
        <TextAction {...shared} leadingIcon={shown} size={Size.Sm}>
          {text}
        </TextAction>
      ) : (
        <IconAction
          {...shared}
          aria-label={title}
          icon={shown}
          size={Size.Sm}
        />
      )}
    </Tooltip>
  );
};

export default React.memo(ActionButton);
