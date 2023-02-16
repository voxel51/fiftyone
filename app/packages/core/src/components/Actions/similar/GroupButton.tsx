import React from "react";
import SettingsIcon from "@mui/icons-material/Settings";
import InfoIcon from "@mui/icons-material/Info";
import SearchIcon from "@mui/icons-material/Search";
import styled from "styled-components";
import { IconButton, Tooltip } from "@fiftyone/components";

type GroupButtonProps = {
  buttons: ButtonDetail[];
};

export type ButtonDetail = {
  icon: string;
  arialLabel: string;
  tooltipText: string;
  onClick: () => void;
  sx?: React.CSSProperties;
};

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: row;
  margin: auto 0;
`;

const GroupButton: React.FunctionComponent<GroupButtonProps> = ({
  buttons,
}) => {
  return (
    <ButtonGroup>
      {buttons.map((button) => (
        <Tooltip
          text={button.tooltipText}
          placement={"top-center"}
          key={`actionButton-${button.icon}`}
        >
          <div onClick={button.onClick}>
            <IconButton
              arial-label={button.arialLabel}
              size="small"
              disableRipple
              sx={button.sx}
            >
              {button.icon === "InfoIcon" && <InfoIcon />}
              {button.icon === "SearchIcon" && <SearchIcon />}
              {button.icon === "SettingsIcon" && <SettingsIcon />}
            </IconButton>
          </div>
        </Tooltip>
      ))}
    </ButtonGroup>
  );
};

export default GroupButton;
