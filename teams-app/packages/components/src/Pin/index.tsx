import { PinIcon } from "@fiftyone/teams-components";
import { BoxProps, CircularProgress } from "@mui/material";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

export default function Pin(props: PinPropsType) {
  const {
    fontSize = "1.2rem",
    isHovering,
    handleTogglePin,
    pinned,
    resource = "item",
    styles = {},
    loading,
  } = props;
  const theme = useTheme();
  const unpinHidden = pinned || (!pinned && !isHovering);

  const pinStyles = {
    fontSize,
    color: theme.palette.grey[400],

    "&:hover": {
      color: theme.palette.grey[500],
    },
  };

  const unpinStyles = {
    ...pinStyles,
    visibility: unpinHidden ? "hidden" : "visible",
    opacity: unpinHidden ? "0" : "1",

    transition: "visibility 0s, opacity 0.3s linear",
    overflow: "hidden",
  };

  const finalStyles = { ...styles, ...(pinned ? pinStyles : unpinStyles) };

  return (
    <Box
      display="flex"
      alignItems="center"
      sx={finalStyles}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleTogglePin(e, !pinned);
      }}
      title={`${pinned ? "Unpin" : "Pin"} ${resource}`}
    >
      {loading ? (
        <CircularProgress size={16} />
      ) : (
        <PinIcon variant={pinned ? "contained" : "outlined"} />
      )}
    </Box>
  );
}

export type PinPropsType = {
  fontSize?: string;
  isHovering?: boolean;
  handleTogglePin: (e: MouseEvent, pinned: boolean) => void;
  pinned: boolean;
  styles?: BoxProps["sx"];
  resource?: string;
  loading?: boolean;
};
