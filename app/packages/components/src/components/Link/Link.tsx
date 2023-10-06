import React, { MouseEventHandler } from "react";

const Link: React.FC<
  React.PropsWithChildren<{
    to?: MouseEventHandler;
    title: string;
    className?: string;
    style?: React.CSSProperties;
    target?: React.HTMLAttributeAnchorTarget;
    cy?: string;
  }>
> = ({ children, className, cy, style, target, title, to }) => {
  return (
    <a
      data-cy={cy}
      onClick={to}
      style={style}
      className={className}
      target={target}
      title={title}
    >
      {children}
    </a>
  );
};

export default Link;
