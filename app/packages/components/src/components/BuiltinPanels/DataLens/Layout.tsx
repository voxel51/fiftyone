import { Box, Link, Tab, Tabs } from "@mui/material";
import { useMemo, useRef } from "react";

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
  // We want our content to be responsive, but media queries don't work because
  // we don't care about the size of the window, but rather the size of our
  // container.
  const containerRef = useRef(null);
  const containerWidth = containerRef.current?.offsetWidth ?? 0;

  const contentMaxWidth = useMemo(() => {
    const breakpoint = 1200;
    const widthAtBreakpoint = breakpoint * 0.8;
    if (containerWidth > breakpoint) {
      return "80%";
    } else if (containerWidth > widthAtBreakpoint) {
      return `${Math.round(widthAtBreakpoint)}px`;
    } else {
      return "100%";
    }
  }, [containerWidth]);

  return (
    <>
      {/*Main panel*/}
      <Box ref={containerRef} sx={{ m: 2 }}>
        <Box sx={{ maxWidth: contentMaxWidth, m: "auto" }}>
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

            <Link
              target="_blank"
              href="https://docs.voxel51.com/teams/data_lens.html"
            >
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
