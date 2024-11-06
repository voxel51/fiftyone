import { Launch, SsidChart } from "@mui/icons-material";
import { Box, Button, Card, Stack, Typography } from "@mui/material";
import React from "react";
import Evaluate from "./Evaluate";

export default function EmptyOverview(props: EmptyOverviewProps) {
  const { height, onEvaluate, permissions } = props;
  return (
    <Card
      sx={{
        height: `calc(${height}px - 32px)`,
        margin: "16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Stack sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Stack sx={{ alignItems: "center" }} spacing={2}>
          <SsidChart sx={{ fontSize: 48, color: "#FFC59B" }} />
          <Typography>
            Run your first model evaluation to see results.
          </Typography>
          <Evaluate
            onEvaluate={onEvaluate}
            permissions={permissions}
            variant="empty"
          />
        </Stack>
        <Stack sx={{ alignItems: "center" }} spacing={1}>
          <Typography color="secondary" sx={{ pt: 4 }}>
            Learn more about evaluating models in FiftyOne
          </Typography>
          <Box>
            <Button
              endIcon={<Launch />}
              variant="outlined"
              color="secondary"
              href={"https://docs.voxel51.com/user_guide/evaluation.html"}
              target="_blank"
            >
              View documentation
            </Button>
          </Box>
        </Stack>
      </Stack>
    </Card>
  );
}

type EmptyOverviewProps = {
  height: number;
  onEvaluate: () => void;
  permissions: Record<string, boolean>;
};
