import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { FormState, OperatorConfigurator } from "./OperatorConfigurator";
import React from "react";

export const LensQuery = ({
  expanded,
  expandIcon,
  operatorUri,
  formState,
  onHeaderClick,
  onStateChange,
  onReadyChange,
}: {
  expanded: boolean;
  expandIcon: React.ReactNode;
  operatorUri: string;
  formState: FormState;
  onHeaderClick: () => void;
  onStateChange: (state: FormState, isValid: boolean) => void;
  onReadyChange: (ready: boolean) => void;
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Accordion expanded={expanded}>
        <AccordionSummary expandIcon={expandIcon} onClick={onHeaderClick}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6">Query parameters</Typography>
            <Typography>&bull;</Typography>
            <Typography color="secondary">
              {Object.keys(formState)
                .map((k) => (formState[k] || formState[k] === 0 ? 1 : 0))
                .reduce((l, r) => l + r, 0)}{" "}
              filters applied
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <OperatorConfigurator
            operator={operatorUri}
            formState={formState}
            onStateChange={onStateChange}
            onReadyChange={onReadyChange}
          />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
