import { Box, Link, Tab, Tabs } from "@mui/material";

export type TabConfig = {
  id: string;
  label: string;
  content: React.ReactNode;
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
  active: string;
  onTabClick: (tabId: string) => void;
}) => {
  return (
    <>
      {/*Main panel*/}
      <Box sx={{ m: 2 }}>
        <Box sx={{ maxWidth: { lg: "80%" }, m: "auto" }}>
          {/*Tabs header*/}
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
              {tabs.map((tab) => (
                <Tab key={tab.id} label={tab.label} value={tab.id} />
              ))}
            </Tabs>

            <Link target="_blank" href="https://docs.voxel51.com">
              View Docs
            </Link>
          </Box>

          {/*Tab content*/}
          <Box sx={{ m: 2 }}>
            {tabs.find((tab) => tab.id === active)?.content}
          </Box>
        </Box>
      </Box>
    </>
  );
};
