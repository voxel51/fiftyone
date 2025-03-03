import { PreviewResponse } from "./models";
import React, { Fragment } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Lens } from "./Lens";
import { ZoomSlider } from "./controls/ZoomSlider";
import { ViewToggler } from "./controls/ViewToggler";
import { SelectLabels } from "./controls/SelectLabels";
import IconButton from "../../IconButton";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { Schema } from "@fiftyone/utilities";

export const LensPreview = ({
  expanded,
  onHeaderClick,
  loading,
  previewTime,
  searchResponse,
  schema,
  previewError,
}: {
  expanded: boolean;
  onHeaderClick: () => void;
  loading: boolean;
  searchResponse?: PreviewResponse;
  previewTime: number;
  schema?: Schema;
  previewError?: string | Error;
}) => {
  if (loading) {
    return (
      <Box>
        <Accordion expanded={expanded}>
          <AccordionSummary
            expandIcon={<CircularProgress size="1.5rem" />}
            onClick={onHeaderClick}
          >
            <Typography variant="h6">Preview</Typography>
          </AccordionSummary>
          <AccordionDetails></AccordionDetails>
        </Accordion>
      </Box>
    );
  } else if (searchResponse || previewError) {
    return (
      <Box>
        <Accordion expanded={expanded}>
          <Box sx={{ minHeight: "48px", p: "16px" }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              spacing="auto"
              width="100%"
            >
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="h6">Preview</Typography>
                <Typography>&bull;</Typography>
                <Typography color="secondary">
                  {(previewTime / 1000).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  seconds
                </Typography>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={2}>
                {expanded && (
                  <>
                    <ZoomSlider />
                    <ViewToggler />
                    <SelectLabels schema={schema!} />
                  </>
                )}
                <IconButton sx={{ p: 0 }} onClick={onHeaderClick}>
                  {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Stack>
            </Stack>
          </Box>
          <AccordionDetails>
            {previewError ? (
              <Box>
                <Typography textAlign="center" color="error">
                  Error generating preview: {`${previewError}`}
                </Typography>
              </Box>
            ) : searchResponse.result_count > 0 ? (
              <Lens
                samples={searchResponse.query_result}
                sampleSchema={schema!}
              />
            ) : (
              <Box>
                <Typography textAlign="center" color="secondary">
                  No results found
                </Typography>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    );
  } else {
    return <Fragment />;
  }
};
