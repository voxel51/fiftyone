import { IconButton, Tooltip } from "@fiftyone/components";
import InfoIcon from "@mui/icons-material/Info";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import CircularProgress from "@mui/material/CircularProgress";
import type { CSSProperties } from "react";
import React from "react";
import styled from "styled-components";

type GroupButtonProps = {
  buttons: ButtonDetail[];
};

export type ButtonDetail = {
  icon: string;
  ariaLabel: string;
  tooltipText: string;
  onClick: () => void;
  sx?: CSSProperties;
};

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const GroupButton = ({ buttons }: GroupButtonProps) => {
  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
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
    </div>
  );
};

export default GroupButton;
