import { useTheme } from "@fiftyone/components";
import { SpaceNode, useSpaceNodes, useSpaces } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
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
  const PANEL_NAME = "query_performance_panel";
  const { FIFTYONE_GRID_SPACES_ID } = fos.constants;
  const { spaces } = useSpaces(FIFTYONE_GRID_SPACES_ID);
  const openedPanels = useSpaceNodes(FIFTYONE_GRID_SPACES_ID);
  return (
    <Tooltip
      title={
        <div>
          {showExpanded ? (
            <Box sx={{ padding: "8px 8px 8px 8px" }}>
              <SectionTitle>Query Performance is Enabled</SectionTitle>
              <Text>
                Fields that are indexed will have better query performance. You
                can create or manage indexes from here.
              </Text>
              <Box
                display="flex"
                alignItems="center"
                paddingTop="8px"
                gap="4px"
              >
                <Button
                  variant="contained"
                  sx={{
                    backgroundColor: theme.primary.main,
                    color: theme.text.primary,
                    boxShadow: 0,
                    flexGrow: 1,
                  }}
                  onClick={() => {
                    let openedPanel = openedPanels.find(
                      ({ type }) => type === PANEL_NAME
                    );
                    if (!openedPanel) {
                      openedPanel = new SpaceNode();
                      openedPanel.type = PANEL_NAME;
                      spaces.addNodeAfter(spaces.root, openedPanel, true);
                    }
                    spaces.setNodeActive(openedPanel);
                  }}
                >
                  Manage Indexes
                </Button>
                <Button
                  onClick={() => {
                    setShowExpanded(false);
                  }}
                  variant="text"
                  color="secondary"
                  sx={{
                    marginLeft: "auto",
                    color: theme.text.secondary,
                    flexGrow: 1,
                  }}
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
