import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography,
} from "@mui/material";
import { FormState, OperatorConfigurator } from "./OperatorConfigurator";
import React, { useMemo } from "react";

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
  const numFilters = useMemo(() => {
    return Object.values(formState)
      .map((v) => !!v || v === 0)
      .reduce((acc, curr) => acc + (curr ? 1 : 0), 0);
  }, [formState]);

  return (
    <Box>
      <Accordion expanded={expanded}>
        <AccordionSummary expandIcon={expandIcon} onClick={onHeaderClick}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6">Query parameters</Typography>
            <Typography>&bull;</Typography>
            <Typography color="secondary">
              {`${numFilters} ${
                numFilters === 1 ? "filter" : "filters"
              } applied`}
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
