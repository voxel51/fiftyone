import { useTheme } from "@fiftyone/components";
import { QP_MODE } from "@fiftyone/core";
import { getBrowserStorageEffectForKey } from "@fiftyone/state";
import { Bolt } from "@mui/icons-material";
import { Box, Button, Tooltip } from "@mui/material";
import React from "react";
import { atom, useRecoilState } from "recoil";
import styled from "styled-components";

const SectionTitle = styled.div`
  font-size: 1rem;
  line-height: 2.25rem;
  color: ${({ theme }) => theme.text.primary};
`;

const Text = styled.p`
  font-size: 1rem;
  line-height: 1.25rem;
  margin: 0;
  padding: 0;
  margin-bottom: 0.5rem;
  max-width: 215px;
  color: ${({ theme }) => theme.text.secondary};

  & > a {
    color: ${({ theme }) => theme.primary.plainColor};
  }
`;

const showExpandedTooltip = atom({
  key: "showExpandedQueryPerformanceTooltip",
  default: true,
  effects: [
    getBrowserStorageEffectForKey("showExpandedQueryPerformanceTooltip", {
      valueClass: "boolean",
    }),
  ],
});

const QueryPerformanceIcon = () => {
  const theme = useTheme();
  const [showExpanded, setShowExpanded] = useRecoilState(showExpandedTooltip);
  const lightningBoltColor = showExpanded
    ? theme.custom.lightning
    : theme.text.secondary;
  return (
    <Tooltip
      title={
        <div>
          {showExpanded ? (
            <Box>
              <SectionTitle>Query Performance is Enabled</SectionTitle>
              <Text>
                Some fields are indexed for better query performance. You can
                create or manage indexes from here.
              </Text>
              <Box display="flex" alignItems="center">
                <Button
                  variant="contained"
                  sx={{
                    marginLeft: "auto",
                    backgroundColor: theme.primary.main,
                    color: theme.text.primary,
                    boxShadow: 0,
                  }}
                  onClick={() => {
                    window.open(QP_MODE, "_blank")?.focus();
                  }}
                >
                  View Documentation
                </Button>
                <Button
                  onClick={() => {
                    setShowExpanded(false);
                  }}
                  variant="text"
                  color="secondary"
                  style={{ marginLeft: "auto", color: theme.text.secondary }}
                >
                  Got it
                </Button>
              </Box>
            </Box>
          ) : (
            <SectionTitle>Query Performance is Enabled</SectionTitle>
          )}
        </div>
      }
      placement="bottom"
      arrow={true}
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: theme.custom.toastBackgroundColor,
            "& .MuiTooltip-arrow": {
              color: theme.custom.toastBackgroundColor,
            },
          },
        },
      }}
    >
      <Bolt style={{ color: lightningBoltColor }} />
    </Tooltip>
  );
};

export default QueryPerformanceIcon;
