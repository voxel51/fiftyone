import {
  Box,
  TextField as MuiTextField,
  Stack,
  TextFieldProps,
  Typography,
} from "@mui/material";

/** @deprecated Removed from plugin environments in FiftyOne 2.0 and Voxel51 3.0. Use @voxel51/voodo instead. */
export default function TextField(props: TextFieldProps) {
  const { label, ...otherProps } = props;
  return (
    <Stack spacing={1}>
      <Box>
        {label && <Typography color="text.secondary">{label}</Typography>}
      </Box>
      <MuiTextField
        InputProps={{
          sx: { backgroundColor: (theme) => theme.palette.background.default },
        }}
        sx={{ "& fieldset": { border: "none" } }}
        {...otherProps}
      />
    </Stack>
  );
}
