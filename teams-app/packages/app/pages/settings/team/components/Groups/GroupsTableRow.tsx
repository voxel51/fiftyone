import { Bubbles, OverflowMenu } from "@fiftyone/teams-components";
import UserCard from "@fiftyone/teams-components/src/UserCard";
import {
  CONSTANT_VARIABLES,
  Group,
  groupInModalState,
  removeGroupState,
  settingsTeamSelectedGroupSlug,
} from "@fiftyone/teams-state";
import { MANUAL_GROUP_MGMT_DISABLED_TEXT } from "@fiftyone/teams-state/src/constants";
import { DeleteOutline } from "@mui/icons-material";
import EditIcon from "@mui/icons-material/Edit";
import { Button, TableCell, TableRow } from "@mui/material";
import Link from "next/link";
import { FC, useMemo } from "react";
import { useSetRecoilState } from "recoil";

interface Props {
  group: Group;
  readOnly?: boolean;
}

const { GROUP_MEMBER_AVATARS_TO_SHOW_COUNT } = CONSTANT_VARIABLES;

const GroupsTableRow: FC<Props> = (props) => {
  const { group, readOnly } = props;
  const { id, usersCount, description, slug, name, users } = group || {};
  const text = usersCount == 1 ? "member" : "members";

  const setRemoveGroupState = useSetRecoilState(removeGroupState);
  const setSelectedGroup = useSetRecoilState(settingsTeamSelectedGroupSlug);
  const setGroupInModal = useSetRecoilState(groupInModalState);

  const members = useMemo(
    () =>
      users?.map((user) => ({
        id: user.id,
        title: user.name,
        picture: user.picture,
      })),
    [users]
  );

  const hiddenUserCount = Math.max(
    usersCount - GROUP_MEMBER_AVATARS_TO_SHOW_COUNT,
    0
  );

  return (
    <Link href={`/settings/team/groups/${slug}`} title={"See group"}>
      <TableRow
        key={slug}
        sx={{
          cursor: "pointer",
          "&:hover": {
            background: (theme) => theme.palette.background.secondary,
          },
        }}
      >
        <TableCell>
          <UserCard
            id={id}
            name={name}
            subtitle={description}
            src={""}
            detailed={true}
          />
        </TableCell>
        <TableCell sx={{ position: "relative" }}>
          <Bubbles
            items={members ?? []}
            itemsToShow={GROUP_MEMBER_AVATARS_TO_SHOW_COUNT}
            showHiddenItemsInTooltip={false}
            hiddenItemsCount={hiddenUserCount}
          />
        </TableCell>
        <TableCell>
          <Button
            variant="text"
            onClick={() => {
              setSelectedGroup(slug);
            }}
          >
            {usersCount} {text}
          </Button>
        </TableCell>
        <TableCell
          onClick={(e) => {
            e.preventDefault();
          }}
        >
          <OverflowMenu
            items={[
              {
                primaryText: "Edit Group Info",
                IconComponent: <EditIcon />,
                onClick: () => {
                  setGroupInModal(group);
                },
                disabled: readOnly,
                title: readOnly ? MANUAL_GROUP_MGMT_DISABLED_TEXT : "",
              },
              {
                primaryText: "Delete Group",
                IconComponent: <DeleteOutline />,
                onClick: () => {
                  setRemoveGroupState(group);
                },
                disabled: readOnly,
                title: readOnly ? MANUAL_GROUP_MGMT_DISABLED_TEXT : "",
              },
            ]}
          />
        </TableCell>
      </TableRow>
    </Link>
  );
};

export default GroupsTableRow;
