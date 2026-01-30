// <<<<<<< HEAD
// import { West as Back, MoreVert } from "@mui/icons-material";
// import { IconButton, Menu, MenuItem } from "@mui/material";
// import { useAtomValue, useSetAtom } from "jotai";
// import { useContext, useState } from "react";
// import { useRecoilValue } from "recoil";
// import * as fos from "@fiftyone/state";
// import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
// import { Redo, Round, Undo } from "../Actions";
// import { ItemLeft, ItemRight } from "../Components";
// import { ConfirmationContext } from "../Confirmation";
// import { ICONS } from "../Icons";
// import { Row } from "./Components";
// import { showModal } from "../state";
// =======

import { useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { Redo, Round, Undo } from "../Actions";

import { ICONS } from "../Icons";
import { Row } from "./Components";
import { ItemLeft, ItemRight } from "../Components";
import { West as Back } from "@mui/icons-material";
import { Box, Menu, MenuItem, Stack } from "@mui/material";
import { Clickable, Icon, IconName, Size, Text } from "@voxel51/voodo";

import { showModal } from "../state";
import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
import {
  currentFieldIsReadOnlyAtom,
  currentOverlay,
  currentType,
  useAnnotationContext,
} from "./state";

import useColor from "./useColor";
import useExit from "./useExit";
import useDelete from "./useDelete";

const LabelHamburgerMenu = () => {
  const [open, setOpen] = useState<boolean>(false);
  const anchor = useRef<HTMLElement | null>(null);
  const onDelete = useDelete();

  // Permission and read-only state
  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const setShowSchemaManager = useSetAtom(showModal);

  // Kebab menu state
  //const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  //const menuOpen = Boolean(anchorEl);

  // const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
  //   setAnchorEl(event.currentTarget);
  // };

  // const handleMenuClose = () => {
  //   setAnchorEl(null);
  // };

  const handleOpenSchemaManager = () => {
    setShowSchemaManager(true);
    setOpen(false); //handleMenuClose();
  };

  // Show menu if user can edit labels and field is read-only
  const showEditSchema = canEditLabels.enabled && currentFieldIsReadOnly;

  // <<<<<<< HEAD
  //           {showMenu && (
  //             <>
  //               <IconButton
  //                 size="small"
  //                 onClick={handleMenuClick}
  //                 sx={{ ml: 1 }}
  //                 aria-label="label options"
  //               >
  //                 <MoreVert />
  //               </IconButton>
  //               <Menu
  //                 anchorEl={anchorEl}
  //                 open={menuOpen}
  //                 onClose={handleMenuClose}
  //                 anchorOrigin={{
  //                   vertical: "bottom",
  //                   horizontal: "right",
  //                 }}
  //                 transformOrigin={{
  //                   vertical: "top",
  //                   horizontal: "right",
  //                 }}
  //                 sx={{
  //                   zIndex: 10000,
  //                 }}
  //               >
  //                 <MenuItem onClick={handleOpenSchemaManager}>
  //                   Edit field schema
  //                 </MenuItem>
  //               </Menu>
  //             </>
  //           )}
  //         </ItemRight>
  //       )}
  // =======
  return (
    <>
      <Clickable onClick={() => setOpen(true)}>
        <Box ref={anchor} sx={{ p: 0.5 }}>
          <Icon name={IconName.MoreVertical} size={Size.Md} />
        </Box>
      </Clickable>

      <Menu
        anchorEl={anchor.current}
        open={open}
        onClose={() => setOpen(false)}
        sx={{ zIndex: 9999 }}
      >
        <MenuItem onClick={onDelete}>
          <Stack direction="row" gap={1} alignItems="center">
            <Icon name={IconName.Delete} size={Size.Md} />
            <Text>Delete label</Text>
          </Stack>
        </MenuItem>
        {showEditSchema && (
          <MenuItem onClick={handleOpenSchemaManager}>
            Edit field schema
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type?.toLowerCase() ?? ""];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);
  const onExit = useExit();
  const annotationContext = useAnnotationContext();

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Round onClick={onExit}>
          <Back />
        </Round>
        {Icon && <Icon fill={color} />}
        <div>Edit {type}</div>
      </ItemLeft>
      {currentFieldIsReadOnly && <span>Read-only</span>}
      <ItemRight>
        <Stack direction="row" alignItems="center">
          {!currentFieldIsReadOnly &&
            !isAnnotatingPolyline &&
            !isAnnotatingCuboid && (
              <>
                <Undo />
                <Redo />
              </>
            )}
          {annotationContext.selectedLabel !== null && <LabelHamburgerMenu />}
        </Stack>
      </ItemRight>
    </Row>
  );
};

export default Header;
