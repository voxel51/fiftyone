import React, { DetailedHTMLProps } from "react";

export const useExternalLink = (
<<<<<<< HEAD
  _href?: string,
=======
  href?: string,
>>>>>>> main
): React.MouseEventHandler<HTMLAnchorElement> | undefined => {
  return undefined;
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
  return (
    <a
      {...props}
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
    />
  );
};

export default ExternalLink;
