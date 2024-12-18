import { West } from "@mui/icons-material";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import React from "react";
import ErrorIcon from "./ErrorIcon";

export default function Error(props: ErrorProps) {
  const { onBack } = props;
  return (
    <Stack sx={{ height: "100%", p: 2 }} spacing={1}>
      <Box>
        <Button onClick={onBack} startIcon={<West />} color="secondary">
          Back to Model Evaluation
        </Button>
      </Box>
      <Card
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
        }}
      >
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <ErrorIcon sx={{ fontSize: 64 }} />
          <Typography color="secondary">
            Analyze and improve models collaboratively with your team
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>
            The Model Evaluation panel currently supports only classification,
            detection, and segmentation evaluations
          </Typography>
        </Stack>
      </Card>
    </Stack>
  );
}

type ErrorProps = {
  onBack: () => void;
};
