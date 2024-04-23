import { Box, LinearProgress, Typography } from "@mui/material";

export default function OperatorFormExecuting() {
  return (
    <Box>
      <LinearProgress />
      <Typography sx={{ pt: 1, textAlign: "center" }}>Executing...</Typography>
    </Box>
  );
}
