import { SvgIcon, SvgIconProps } from "@mui/material";
import { GitHub, MenuBook, Info as InfoIcon } from "@material-ui/icons";
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

export function Copy(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3M7,7H17V5H19V19H5V5H7V7Z" />
    </SvgIcon>
  );
}
export function Close(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,19H5V5H19V19M17,8.4L13.4,12L17,15.6L15.6,17L12,13.4L8.4,17L7,15.6L10.6,12L7,8.4L8.4,7L12,10.6L15.6,7L17,8.4Z" />
    </SvgIcon>
  );
}

export { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
export { IconButton } from "@mui/material";
export { InfoIcon };
