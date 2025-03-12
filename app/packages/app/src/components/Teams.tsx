import { Button, ExternalLink, useTheme } from "@fiftyone/components";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import {
  Box,
  Button as MuiButton,
  Popover,
  Stack,
  Typography,
  useColorScheme,
} from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import styled, { css, keyframes } from "styled-components";

const ENTERPRISE_TOOLTIP_LS = "fiftyone-enterprise-tooltip-seen";
const ENTERPRISE_BUTTON_ID = "fo-cta-enterprise-button";

const DARK_BG_COLOR = "#333333";
const LIGHT_BG_COLOR = "#FFFFFF";

const GRADIENT_START_COLOR = "#FF6D04";
const GRADIENT_END_COLOR = "#B681FF";

// subtle pulse animation for the sparkles icon
const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.9;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
`;

// styles that will be applied to the icon container
const pulseAnimation = css`
  animation: ${pulse} 1.5s ease-in-out infinite;
`;

const IconContainer = styled.div`
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
`;

// https://stackoverflow.com/questions/65282139/adding-a-linear-gradient-to-material-ui-icon
const GradientAutoAwesomeIcon = () => (
  <>
    <svg width={0} height={0} aria-label="Gradient" aria-labelledby="gradient">
      <title>Gradient</title>
      <defs>
        <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: GRADIENT_START_COLOR, stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: GRADIENT_END_COLOR, stopOpacity: 1 }}
          />
        </linearGradient>
      </defs>
    </svg>
    <IconContainer className="fo-teams-cta-pulse-animation">
      <AutoAwesomeIcon
        sx={{
          fontSize: { xs: 16, sm: 20 },
          mr: 1,
          fill: "url(#gradient1)",
        }}
      />
    </IconContainer>
  </>
);

const ButtonContainer = styled.div<{ bgColor: string }>`
  background-color: ${({ bgColor }) => bgColor};
  border-radius: 16px;

  &:hover {
    background-color: transparent;
  }
`;

const StyledExternalLink = styled(ExternalLink)`
  text-decoration: none;

  &:hover {
    text-decoration: none;
  }
`;

const BaseEnterpriseButton = styled(Button)<{
  borderColor: string;
  isLightMode?: boolean;
}>`
  background: linear-gradient(45deg, #ff6d04 0%, #b681ff 100%);
  background-clip: text;
  -webkit-background-clip: text;
  text-fill-color: transparent;
  -webkit-text-fill-color: transparent;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 12px;
  border-radius: 16px;
  font-weight: 500;
  text-transform: none;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  text-decoration: none;
  font-size: 16px;
  position: relative;
  overflow: hidden;
  border: 1px solid ${({ borderColor }) => borderColor};
  outline: none;
  box-shadow: none;

  @media (max-width: 767px) {
    font-size: 14px;
    padding: 4px 10px;
  }

  &:before {
    content: "";
    position: absolute;
    top: 0;
    left: -100%;
    width: ${({ isLightMode }) => (isLightMode ? "150%" : "100%")};
    height: 100%;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, ${({ isLightMode }) => (isLightMode ? "0.3" : "0.2")})
        50%,
      rgba(255, 255, 255, 0) 100%
    );
    transition: all ${({ isLightMode }) => (isLightMode ? "0.8s" : "0.6s")} ease;
    z-index: 1;
  }

  &:hover,
  &:focus,
  &:active {
    transform: scale(1.03);
    text-decoration: none;
    border: 1px solid ${({ borderColor }) => borderColor} !important;
    outline: none;
    box-shadow: none;

    background: linear-gradient(45deg, #ff6d04 0%, #b681ff 100%) !important;
    background-clip: text !important;
    -webkit-background-clip: text !important;
    text-fill-color: transparent !important;
    -webkit-text-fill-color: transparent !important;

    &:before {
      left: 100%;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0) 0%,
        rgba(
            255,
            255,
            255,
            ${({ isLightMode }) => (isLightMode ? "0.6" : "0.2")}
          )
          50%,
        rgba(255, 255, 255, 0) 100%
      );
    }

    .fo-teams-cta-pulse-animation {
      ${pulseAnimation}
    }
  }
`;

const PopoverContent = styled(Box)`
  padding: 16px;
  width: 310px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const PopoverHeading = styled(Typography)`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
`;

const PopoverBody = styled(Typography)`
  position: relative;
  color: var(--fo-palette-text-secondary);
  font-size: 15px !important;
`;

const PopoverFooter = styled(Stack)`
  margin-top: 16px;
`;

export default function Teams({
  disablePopover = false,
}: { disablePopover?: boolean }) {
  const [showPopover, setShowPopover] = useState(false);

  const { mode } = useColorScheme();
  const theme = useTheme();

  const bgColor = mode === "light" ? LIGHT_BG_COLOR : DARK_BG_COLOR;

  useEffect(() => {
    const hasSeenTooltip = window.localStorage.getItem(ENTERPRISE_TOOLTIP_LS);

    // don't show intro popoverif we're in playwright
    const isPlaywright = window["IS_PLAYWRIGHT"];
    
    if (!hasSeenTooltip && !isPlaywright) {
      setShowPopover(true);
    }
  }, []);

  const markTooltipSeen = useCallback(() => {
    localStorage.setItem(ENTERPRISE_TOOLTIP_LS, "true");
  }, []);

  const handlePopoverClose = useCallback(() => {
    markTooltipSeen();
    setShowPopover(false);
  }, [markTooltipSeen]);

  const handleExplore = useCallback(() => {
    markTooltipSeen();
    setShowPopover(false);
    window.open(
      "https://voxel51.com/why-upgrade?utm_source=FiftyOneApp",
      "_blank"
    );
  }, [markTooltipSeen]);

  return (
    <>
      <ButtonContainer bgColor={mode === "light" ? "transparent" : bgColor}>
        <StyledExternalLink href="https://voxel51.com/why-upgrade?utm_source=FiftyOneApp">
          <BaseEnterpriseButton
            borderColor={mode === "dark" ? DARK_BG_COLOR : theme.divider}
            isLightMode={mode === "light"}
            id={ENTERPRISE_BUTTON_ID}
          >
            <GradientAutoAwesomeIcon />
            Explore Enterprise
          </BaseEnterpriseButton>
        </StyledExternalLink>
      </ButtonContainer>

      {showPopover && !disablePopover && (
        <Popover
          open
          anchorEl={document.getElementById(ENTERPRISE_BUTTON_ID)}
          onClose={handlePopoverClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "center",
          }}
          transformOrigin={{
            vertical: -12,
            horizontal: "center",
          }}
          elevation={3}
        >
          <PopoverContent
            style={{
              backgroundColor:
                mode === "light" ? LIGHT_BG_COLOR : DARK_BG_COLOR,
            }}
          >
            <PopoverHeading variant="h6">
              <GradientAutoAwesomeIcon />
              <Typography variant="h6" letterSpacing={0.3}>
                Accelerate your workflow
              </Typography>
            </PopoverHeading>

            <PopoverBody variant="body2">
              With FiftyOne Enterprise you can connect to your data lake,
              automate your data curation and model analysis tasks, securely
              collaborate with your team, and more.
            </PopoverBody>

            <PopoverFooter direction="row" spacing={2}>
              <MuiButton
                variant="contained"
                onClick={handleExplore}
                size="large"
                sx={{
                  boxShadow: "none",
                }}
              >
                Explore Enterprise
              </MuiButton>
              <MuiButton
                variant="outlined"
                color="secondary"
                onClick={handlePopoverClose}
                size="large"
                sx={{
                  boxShadow: "none",
                }}
              >
                Dismiss
              </MuiButton>
            </PopoverFooter>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
