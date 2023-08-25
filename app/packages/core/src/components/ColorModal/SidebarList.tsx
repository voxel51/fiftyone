import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import Collapse from "@mui/material/Collapse";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import { Resizable } from "re-resizable";
import React, { useState } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import styles from "../../../../../packages/components/src/scrollable.module.css";
import { resizeHandle } from "./../Sidebar/Sidebar.module.css";
import { activeColorEntry } from "./state";
import { ACTIVE_FIELD, getDisplayName } from "./utils";

const WIDTH = 230;

const SidebarList: React.FC = () => {
  const theme = useTheme();
  const activeEntry = useRecoilValue(activeColorEntry);
  if (!activeEntry) {
    throw new Error("entry not defined in color modal");
  }

  const [width, setWidth] = useState(WIDTH);
  const stableGroup = [
    { paths: [ACTIVE_FIELD.GLOBAL, ACTIVE_FIELD.JSON], name: "general" },
    { paths: [{ path: "tags" }], name: "tags" },
  ];
  const fieldGroups = useRecoilValue(
    fos.sidebarGroups({ modal: false, loading: false })
  )
    .filter((g) => g.name !== "tags")
    .map((group) => ({
      ...group,
      paths: group.paths.map((path) => ({ path })),
    }));

  const groups = [...stableGroup, ...fieldGroups];
  const [groupOpen, setGroupOpen] = React.useState(
    new Array(groups.length).fill(true)
  );
  const handleGroupClick = (_, idx) => {
    setGroupOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const onSelectField = useRecoilCallback(
    ({ set }) =>
      async (value: ACTIVE_FIELD | { path: string }) => {
        set(activeColorEntry, value);
      },
    []
  );

  return (
    <Resizable
      size={{ height: "100%", width }}
      minWidth={WIDTH}
      maxWidth={600}
      enable={{
        top: false,
        right: true,
        left: false,
        bottom: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(e, direction, ref, { width: d }) => {
        setWidth(width + d);
        // reset sidebar width on double click
        if (e.detail === 2) setWidth(WIDTH);
      }}
      handleStyles={{
        ["right"]: { right: 0, width: 4 },
      }}
      handleClasses={{
        ["right"]: resizeHandle,
      }}
      style={{ overflowY: "auto", overflowX: "hidden" }}
      className={styles.scrollable}
    >
      <List
        sx={{
          bgcolor: theme.background.level2,
          height: "100%",
          width: "100%",
          borderRight: `1px solid ${theme.background.level3}`,
        }}
        component="nav"
        aria-labelledby="nested-list-subheader"
      >
        {groups.map((group, index) => {
          return (
            <div key={`group-${group.name}`}>
              <ListItemButton
                onClick={(ev) => handleGroupClick(ev, index)}
                disableRipple
              >
                <ListItemText
                  primary={group.name?.toUpperCase()}
                  sx={{ fontFamily: "palanquin, sans-serif" }}
                />
                {groupOpen[index] ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={groupOpen[index]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {group.paths.map((entry, pathIdx) => (
                    <ListItemButton
                      sx={{
                        pl: 4,
                        margin: "-0.25rem",
                        "&.Mui-selected": {
                          backgroundColor: theme.primary.main,
                        },
                        "&.Mui-selected:hover": {
                          backgroundColor: theme.primary.main,
                        },
                      }}
                      key={`menu-${pathIdx}`}
                      data-cy={`color-modal-list-item-${getDisplayName(entry)}`}
                      selected={
                        typeof activeEntry === typeof entry
                          ? typeof entry === "string"
                            ? activeEntry === entry
                            : typeof activeEntry === "object"
                            ? activeEntry.path === entry.path
                            : false
                          : false
                      }
                      disableRipple
                    >
                      <ListItemText
                        primary={getDisplayName(entry)}
                        onClick={() => onSelectField(entry)}
                        sx={{ fontFamily: "palanquin, sans-serif" }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </div>
          );
        })}
      </List>
    </Resizable>
  );
};

export default SidebarList;
