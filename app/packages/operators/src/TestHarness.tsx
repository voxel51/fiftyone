import React, { useState } from "react";
import { Speedup } from "./components/OperatorPromptSpeedup"; // Adjust path
import { Box, Paper, Typography } from "@mui/material";

export const TestHarness = () => {
  // Use state to make the component interactive
  const [numBatches, setNumBatches] = useState(12);
  const MAX_WORKERS = 8;

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        Speedup Component Test Harness
      </Typography>
      <Paper sx={{ p: 3, mt: 2, maxWidth: "500px" }}>
        <Speedup
          value={numBatches}
          onChange={setNumBatches}
          maxWorkers={MAX_WORKERS}
        />
      </Paper>
      <Typography variant="body1" sx={{ mt: 3 }}>
        <strong>Current state value in harness:</strong> {numBatches}
      </Typography>
    </Box>
  );
};
