import React, { MouseEventHandler } from "react";

const Link: React.FC<
  React.PropsWithChildren<{
    to?: MouseEventHandler;
    title: string;
    className?: string;
    style?: React.CSSProperties;
    target?: React.HTMLAttributeAnchorTarget;
  }>
> = ({ children, className, style, target, title, to }) => {
  return (
    <a
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
