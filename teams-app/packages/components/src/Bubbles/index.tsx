import { useTheme } from "@mui/material/styles";
import { Box, Typography, Tooltip } from "@mui/material";
import React, { useMemo } from "react";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import UserCard from "../UserCard";

const { MEMBER_AVATARS_TO_SHOW_COUNT } = CONSTANT_VARIABLES;

interface Item {
  title: string;
  id: string;
  picture?: string;
}
interface Props {
  items: Array<Item>;
  itemsToShow?: number;
  hiddenItemsCount?: number;
  showHiddenItemsInTooltip?: boolean;
}

export default function Bubble(props: Props) {
  const theme = useTheme();
  const {
    items,
    itemsToShow = MEMBER_AVATARS_TO_SHOW_COUNT,
    hiddenItemsCount,
    showHiddenItemsInTooltip = true,
  } = props;

  const toShowItems = useMemo(() => items.slice(0, itemsToShow), [items]);
  const toHideItems = useMemo(() => items.slice(itemsToShow), [items]);
  const hiddenCount =
    typeof hiddenItemsCount === "number"
      ? hiddenItemsCount
      : toHideItems.length;

  const hiddenTitle = useMemo(() => {
    if (!showHiddenItemsInTooltip) return null;
    return (
      <Box
        display="flex"
        sx={{ color: theme.palette.background.default }}
        flexDirection="column"
      >
        {toHideItems.map((member) => {
          return (
            <Typography
              variant="body1"
              key={member.id}
              color={theme.palette.background.default}
            >
              {member.title}
            </Typography>
          );
        })}
      </Box>
    );
  }, [toHideItems]);
  return (
    <Box display="flex" flexDirection="row">
      {toShowItems.map((item, index) => (
        <Tooltip title={item.title} key={item.id}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              marginLeft: index === 0 ? 0 : -1.5,
              zIndex: index + 1,
            }}
          >
            <UserCard name={item.title} src={item.picture} />
          </Box>
        </Tooltip>
      ))}
      {hiddenCount > 0 && (
        <Tooltip title={hiddenTitle} key="more-members">
          <UserCard
            name={`+ ${hiddenCount}`}
            sx={{
              boxShadow: theme.voxelShadows.leftSm,
              display: "flex",
              flexDirection: "row",
              marginLeft: -2,
              zIndex: toShowItems.length,
            }}
          />
        </Tooltip>
      )}
    </Box>
  );
}
