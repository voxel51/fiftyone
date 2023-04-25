import React from "react";
import { Box, Stack, Typography } from "@mui/material";
import HelpTooltip from "./HelpTooltip";

type RoundedTabsProps = {
  tabs: Array<{ id: string; label: string }>;
  selected: string;
  onChange: (tab: string) => void;
};

export default function RoundedTabs({
  tabs,
  selected,
  onChange,
}: RoundedTabsProps) {
  return (
    <Box
      sx={{
        display: "flex",
        background: (theme) => theme.palette.background.level3,
        borderRadius: 1,
        p: 0.5,
      }}
    >
      {tabs.map(({ label, id, description }, i) => {
        const active = selected === id;
        return (
          <Box
            className={active ? "active" : ""}
            key={id}
            onClick={() => {
              onChange(id);
            }}
            sx={{
              flex: 1,
              borderRadius: 1,
              py: 1,
              px: 2,
              mr: i === tabs.length - 1 ? 0 : 0.5,
              cursor: "pointer",
              textAlign: "center",
              color: (theme) => theme.palette.text.secondary,
              "&:hover,&.active": {
                background: (theme) => theme.palette.background.level2,
              },
              "&.active": {
                color: (theme) => theme.palette.text.primary,
                // boxShadow: (theme) => theme.voxelShadows.sm,
              },
            }}
          >
            <Stack
              direction="row"
              justifyContent="center"
              alignItems="center"
              spacing={1}
            >
              <Typography variant="body1" color="inherit">
                {label}
              </Typography>
              {description && <HelpTooltip title={description} />}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
