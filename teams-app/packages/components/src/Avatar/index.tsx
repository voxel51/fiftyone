import {
  Box,
  Avatar as MUIAvatar,
  AvatarProps as MUIAvatarProps,
  Typography,
  useTheme,
} from "@mui/material";
import { stringToColor } from "../utils";
import { Tooltip } from "@fiftyone/components";

export type AvatarProps = MUIAvatarProps & {
  title?: string;
  subtitle?: string;
  detailed?: boolean;
  compact?: boolean;
  color?: "primary" | "secondary";
  bgColor?: string;
  titleSx?: Record<string, string>;
};

export default function Avatar(props: AvatarProps) {
  const {
    color,
    compact,
    detailed,
    title,
    subtitle,
    titleSx = {},
    bgColor,
    ...avatarProps
  } = props;
  const theme = useTheme();
  const baseStyle = {
    bgcolor: bgColor || stringToColor(title), // bgcolor is not a typo
    color: "#fff", // consistent color with gmail default avatars
    fontSize: "1.4rem",
    fontWeight: 500,
  };
  const AvatarComponent = (
    <MUIAvatar
      imgProps={{ referrerPolicy: "no-referrer" }}
      sx={
        compact
          ? { width: 21, height: 21, ...baseStyle }
          : {
              ...baseStyle,
              boxShadow: theme.voxelShadows.leftSm,
            }
      }
      {...avatarProps}
    />
  );

  if (detailed) {
    return (
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Box sx={{ pr: compact ? 1 : 2 }}>{AvatarComponent}</Box>
        <Box>
          <Tooltip text={title} placement="top-center">
            <Typography
              variant="body1"
              color={(theme) => theme.palette.text[color || "primary"]}
              noWrap
              sx={{ maxWidth: "300px", ...titleSx }}
            >
              {title}
            </Typography>
          </Tooltip>
          <Typography
            color={
              color === "secondary" && ((theme) => theme.palette.text.tertiary)
            }
            noWrap
            sx={{ maxWidth: "300px", ...titleSx }}
          >
            {subtitle}
          </Typography>
        </Box>
      </Box>
    );
  }

  return AvatarComponent;
}
