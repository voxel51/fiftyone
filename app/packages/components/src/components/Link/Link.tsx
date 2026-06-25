import React, { MouseEventHandler } from "react";

const Link: React.FC<
  React.PropsWithChildren<{
    to?: MouseEventHandler;
    href?: string;
    title: string;
    className?: string;
    style?: React.CSSProperties;
    target?: React.HTMLAttributeAnchorTarget;
    cy?: string;
  }>
> = ({ children, className, cy, href, style, target, title, to }) => {
  return (
    <a
      data-cy={cy}
      href={href}
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
