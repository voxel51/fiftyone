import { IconButton, Tooltip } from "@fiftyone/components";
import CircularProgress from "@mui/material/CircularProgress";
import type { CSSProperties } from "react";
import { InfoIcon, SearchIcon, SettingsIcon } from "@voxel51/voodo";
import styled from "styled-components";
import { useActionIconSize } from "../iconSize";

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
  const iconSize = useActionIconSize(24);
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
              {button.icon === "SearchIcon" && <SearchIcon size={iconSize} />}
              {button.icon === "ProgressIcon" && (
                <CircularProgress color="inherit" size={"20px"} />
              )}
              {button.icon === "InfoIcon" && <InfoIcon size={iconSize} />}
              {button.icon === "SettingsIcon" && (
                <SettingsIcon size={iconSize} />
              )}
            </IconButton>
          </Container>
        </Tooltip>
      ))}
    </div>
  );
};

export default GroupButton;
