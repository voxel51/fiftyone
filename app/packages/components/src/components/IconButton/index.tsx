import { IconButton as MUIIconButton, IconButtonProps } from "@mui/material";

export default function IconButton(props: IconButtonProps) {
  return (
    <MUIIconButton
      disableRipple
      {...props}
      sx={{
        color: (theme) => theme.palette.text.primary,
        p: 0.5,
        ml: 0.5,
        "&:hover": {
          backgroundColor: (theme) => theme.palette.primary.softBg,
        },
        ...props.sx,
      }}
    />
  );
}
