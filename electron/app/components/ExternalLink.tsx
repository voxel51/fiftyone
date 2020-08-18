import React from "react";
import styled from "styled-components";

import { isElectron } from "../utils/generic";

const Link = styled.a`
  color: ${({ theme }) => theme.font};
`;

const ExternalLink = ({ href, ...props }) => {
  let openExternal;
  if (isElectron()) {
    openExternal = require("electron").shell.openExternal;
  }
  return (
    <Link
      href={href}
      target="_blank"
      {...props}
      onClick={
        openExternal
          ? (e) => {
              e.preventDefault();
              openExternal(href);
            }
          : undefined
      }
    />
  );
};

export default ExternalLink;
