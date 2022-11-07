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
export function JSONIcon(props: SvgIconProps = {}) {
  return (
    <SvgIcon {...props}>
      <path d="M5,3H7V5H5V10A2,2 0 0,1 3,12A2,2 0 0,1 5,14V19H7V21H5C3.93,20.73 3,20.1 3,19V15A2,2 0 0,0 1,13H0V11H1A2,2 0 0,0 3,9V5A2,2 0 0,1 5,3M19,3A2,2 0 0,1 21,5V9A2,2 0 0,0 23,11H24V13H23A2,2 0 0,0 21,15V19A2,2 0 0,1 19,21H17V19H19V14A2,2 0 0,1 21,12A2,2 0 0,1 19,10V5H17V3H19M12,15A1,1 0 0,1 13,16A1,1 0 0,1 12,17A1,1 0 0,1 11,16A1,1 0 0,1 12,15M8,15A1,1 0 0,1 9,16A1,1 0 0,1 8,17A1,1 0 0,1 7,16A1,1 0 0,1 8,15M16,15A1,1 0 0,1 17,16A1,1 0 0,1 16,17A1,1 0 0,1 15,16A1,1 0 0,1 16,15Z" />
    </SvgIcon>
  );
}
export function HelpIcon(props: SvgIconProps = {}) {
  return (
    <SvgIcon {...props}>
      <path
        data-for-panel="help"
        d="M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z"
      />
    </SvgIcon>
  );
}

export { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
export { IconButton } from "@mui/material";
export { InfoIcon };
