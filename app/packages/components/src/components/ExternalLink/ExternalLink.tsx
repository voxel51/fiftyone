import { isElectron } from "@fiftyone/utilities";
import React from "react";
import { DetailedHTMLProps } from "react";

export const useExternalLink = (
  href?: string
): React.MouseEventHandler<HTMLAnchorElement> | undefined => {
  if (!href) {
    return;
  }

  let openExternal: ((href: string) => void) | undefined = undefined;
  if (isElectron()) {
    try {
      openExternal = require("electron").shell.openExternal as (
        href: string
      ) => void;
    } catch {}
  }

  if (openExternal === undefined) {
    return;
  }

  return (e) => {
    e.preventDefault();
    (openExternal as (href: string) => void)(href);
  };
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
