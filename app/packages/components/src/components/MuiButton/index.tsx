import {
  ButtonProps,
  CircularProgress,
  Button,
  Stack,
  useTheme,
} from "@mui/material";
import type { AnchorHTMLAttributes } from "react";

export default function MuiButton(props: ButtonPropsType) {
  const { loading, variant, ...otherProps } = props;
  const theme = useTheme();

  const containedStyles =
    variant === "contained" ? { sx: { color: "white" } } : {};
  const outlinedStyles =
    variant === "outlined"
      ? {
          sx: {
            color: theme.palette.text.secondary,
            borderColor: theme.palette.text.secondary,
          },
        }
      : {};

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ position: "relative" }}
    >
      <Button
        {...containedStyles}
        {...outlinedStyles}
        variant={variant}
        {...otherProps}
      />
      {loading && (
        <CircularProgress size={20} sx={{ position: "absolute", left: 6 }} />
      )}
    </Stack>
  );
}

// with an href MUI renders an anchor, so link attributes pass through
type ButtonPropsType = ButtonProps &
  Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> & {
    loading?: boolean;
  };
