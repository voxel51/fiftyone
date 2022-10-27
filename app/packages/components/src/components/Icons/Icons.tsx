import { SvgIcon } from "@mui/material";
import { GitHub, MenuBook } from "@mui/icons-material";
import React from "react";

import ExternalLink from "../ExternalLink";

import { iconLink } from "./Icons.module.css";

export { iconContainer } from "./Icons.module.css";

export const SlackLink = () => (
  <ExternalLink
    className={iconLink}
    href={
      "https://join.slack.com/t/fiftyone-users/shared_invite/zt-s6936w7b-2R5eVPJoUw008wP7miJmPQ"
    }
    title={"Slack"}
  >
    <SvgIcon
      sx={{
        fill: (theme) => theme.palette.text.secondary,
      }}
    >
      <path d="M6 15a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2h2v2m1 0a2 2 0 0 1 2-2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-5m2-8a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2v2H9m0 1a2 2 0 0 1 2 2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2a2 2 0 0 1 2-2h5m8 2a2 2 0 0 1 2-2a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-2v-2m-1 0a2 2 0 0 1-2 2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2a2 2 0 0 1 2 2v5m-2 8a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2v-2h2m0-1a2 2 0 0 1-2-2a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2a2 2 0 0 1-2 2h-5z" />
    </SvgIcon>
  </ExternalLink>
);

export const GitHubLink = () => {
  return (
    <ExternalLink
      className={iconLink}
      title="GitHub"
      href="https://github.com/voxel51/fiftyone"
    >
      <GitHub
        sx={{
          fill: (theme) => theme.palette.text.secondary,
        }}
      />
    </ExternalLink>
  );
};

export const DocsLink = () => {
  return (
    <ExternalLink
      className={iconLink}
      title="Documentation"
      href="https://voxel51.com/docs/fiftyone/user_guide/app.html"
    >
      <MenuBook
        sx={{
          fill: (theme) => theme.palette.text.secondary,
        }}
      />
    </ExternalLink>
  );
};

export { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
export { IconButton } from "@mui/material";
