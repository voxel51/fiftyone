import React from "react";
import SettingsIcon from "@mui/icons-material/Settings";
import InfoIcon from "@mui/icons-material/Info";
import SearchIcon from "@mui/icons-material/Search";
import CircularProgress from "@mui/material/CircularProgress";
import styled from "styled-components";
import { IconButton, Tooltip } from "@fiftyone/components";

type GroupButtonProps = {
  buttons: ButtonDetail[];
};

export type ButtonDetail = {
  icon: string;
  ariaLabel: string;
  tooltipText: string;
  onClick: () => void;
  sx?: React.CSSProperties;
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const GroupButton: React.FunctionComponent<GroupButtonProps> = ({
  buttons,
}) => {
  return (
    <>
      {buttons.map((button) => (
        <Tooltip
          text={button.tooltipText}
          placement={"top-center"}
          key={`actionButton-${button.icon}`}
        >
          <Container onClick={button.onClick}>
            <IconButton
              arial-label={button.ariaLabel}
              size="small"
              sx={button.sx}
            >
              {button.icon === "SearchIcon" && <SearchIcon />}
              {button.icon === "ProgressIcon" && (
                <CircularProgress color="inherit" size={"20px"} />
              )}
              {button.icon === "InfoIcon" && <InfoIcon />}
              {button.icon === "SettingsIcon" && <SettingsIcon />}
            </IconButton>
          </Container>
        </Tooltip>
      ))}
    </>
  );
};

export default GroupButton;
