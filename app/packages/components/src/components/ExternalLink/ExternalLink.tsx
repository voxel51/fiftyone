import React, { DetailedHTMLProps } from "react";

export const useExternalLink = (
  _href?: string,
): React.MouseEventHandler<HTMLAnchorElement> | undefined => {
  return undefined;
};

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
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
