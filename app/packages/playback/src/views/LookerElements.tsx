import React from "react";
import playbackElementsStyles from "./playback-elements.module.css";
import MinusIcon from "./svgs/minus.svg?react";
import PlusIcon from "./svgs/plus.svg?react";

export const PlusElement = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>(({ ...props }, ref) => {
  const { className, ...otherProps } = props;
  return (
    <div
      ref={ref}
      {...otherProps}
      className={`${className} ${playbackElementsStyles.clickable}`}
      title="Zoom in (+)"
    >
      <PlusIcon />
    </div>
  );
});

export const MinusElement = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>(({ ...props }, ref) => {
  const { className, ...otherProps } = props;
  return (
    <div
      {...otherProps}
      className={`${className} ${playbackElementsStyles.clickable}`}
      title="Zoom out (-)"
    >
      <MinusIcon />
    </div>
  );
});
