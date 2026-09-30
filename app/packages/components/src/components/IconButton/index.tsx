import { IconButton as MUIIconButton, IconButtonProps } from "@mui/material";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function IconButton(props: IconButtonProps) {
  return (
    <MUIIconButton
      {...props}
      sx={{
        color: (theme) => theme.palette.text.secondary,
        p: 0.5,
        ml: 0.5,
        ...props.sx,
      }}
    />
  );
}
