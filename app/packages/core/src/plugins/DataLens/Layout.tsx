import { BottomNavigation, Box, Link, Tab, Tabs } from "@mui/material";

export type TabConfig = {
  id: string;
  label: string;
  content: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * Component responsible for structuring the panel's layout.
 */
export const Layout = ({
  tabs,
  active,
  onTabClick,
}: {
  tabs: TabConfig[];
  active: number;
  onTabClick: (tabIdx: number) => void;
}) => {
  return (
    <>
      {/*Main panel*/}
      <Box sx={{ m: 2 }}>
        {/*Tabs header*/}
        <Box sx={{ maxWidth: "750px", m: "auto" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              borderBottom: "1px solid #333",
            }}
          >
            <Tabs
              value={active}
              onChange={(_, newValue) => onTabClick(newValue)}
            >
              {tabs.map((tab, idx) => (
                <Tab key={tab.label} label={tab.label} value={idx} />
              ))}
            </Tabs>

            <Link target="_blank" href="https://docs.voxel51.com">
              View Docs
            </Link>
          </Box>
        </Box>

        {/*Tab content*/}
        <Box sx={{ m: 2 }}>{tabs[active].content}</Box>
      </Box>

      {/*Sticky footer*/}
      <BottomNavigation>{tabs[active].footer}</BottomNavigation>
    </>
  );
};
