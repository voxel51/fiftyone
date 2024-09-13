import React, { DetailedHTMLProps } from "react";

export const useExternalLink = (
  href?: string
): React.MouseEventHandler<HTMLAnchorElement> | undefined => {
  return;
};

const ExternalLink: React.FC<
  Omit<
    DetailedHTMLProps<
      React.AnchorHTMLAttributes<HTMLAnchorElement>,
      HTMLAnchorElement
    >,
    "target"
  >
> = ({ href, ...props }) => {
  const onClick = useExternalLink(href);
  return <a {...props} href={href} target="_blank" onClick={onClick} />;
};

export default ExternalLink;
