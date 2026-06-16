import React, { DetailedHTMLProps } from "react";

const ExternalLink: React.FC<
  Omit<
    DetailedHTMLProps<
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
      HTMLAnchorElement
    >,
    "target"
  >
> = ({ href, ...props }) => {
  return <a {...props} href={href} target="_blank" />;
};

export default ExternalLink;
