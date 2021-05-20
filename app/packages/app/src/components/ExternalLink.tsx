import React from "react";
import styled from "styled-components";

import { isElectron } from "../utils/generic";

const Link = styled.a`
  color: ${({ theme }) => theme.font};
`;

export const useExternalLink = (href) => {
  let openExternal;
  if (isElectron()) {
    try {
      openExternal = require("electron").shell.openExternal;
    } catch {}
  }

  return openExternal
    ? (e) => {
        e.preventDefault();
        openExternal(href);
      }
    : null;
};

const ExternalLink = ({ href, ...props }) => {
  const onClick = useExternalLink(href);
  return <Link {...props} href={href} target="_blank" onClick={onClick} />;
};

export default ExternalLink;
