import { Box, BoxProps, Typography } from "@mui/material";

type RoundedTabsProps = {
  tabs: Array<{ id: string; label: string; sx?: BoxProps }>;
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
        background: (theme) => theme.palette.background.secondary,
        borderRadius: 1,
        p: 0.5,
      }}
    >
      {tabs.map(({ label, id, sx = {} }, i) => {
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
                background: (theme) => theme.palette.background.secondaryHover,
              },
              "&.active": {
                color: (theme) => theme.palette.text.primary,
                boxShadow: (theme) => theme.voxelShadows.sm,
              },
              ...sx,
            }}
          >
            <Typography variant="body1" color="inherit">
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
