import { West as Back, MoreVert } from "@mui/icons-material";
import { IconButton, Menu, MenuItem } from "@mui/material";
import { useAtom, useAtomValue } from "jotai";
import { useContext, useState } from "react";
import { useRecoilValue } from "recoil";
import * as fos from "@fiftyone/state";
import { current3dAnnotationModeAtom } from "@fiftyone/looker-3d/src/state";
import { Redo, Round, Undo } from "../Actions";
import { ItemLeft, ItemRight } from "../Components";
import { ConfirmationContext } from "../Confirmation";
import { ICONS } from "../Icons";
import { Row } from "./Components";
import {
  currentFieldIsReadOnlyAtom,
  currentFieldIsReadOnlyBaseAtom,
  currentOverlay,
  currentType,
  readOnlyOverrideAtom,
} from "./state";
import useColor from "./useColor";

const Header = () => {
  const type = useAtomValue(currentType);
  const Icon = ICONS[type?.toLowerCase() ?? ""];
  const color = useColor(useAtomValue(currentOverlay) ?? undefined);
  const { onExit } = useContext(ConfirmationContext);

  const current3dAnnotationMode = useRecoilValue(current3dAnnotationModeAtom);
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  // Permission and read-only state
  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const currentFieldIsReadOnlyBase = useAtomValue(
    currentFieldIsReadOnlyBaseAtom
  );
  const [readOnlyOverride, setReadOnlyOverride] = useAtom(readOnlyOverrideAtom);

  // Kebab menu state
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleToggleReadOnly = () => {
    setReadOnlyOverride(!readOnlyOverride);
    handleMenuClose();
  };

  // Show menu if user can edit labels and field is read-only
  const showMenu = canEditLabels.enabled && currentFieldIsReadOnlyBase;

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
      {!isAnnotatingPolyline && !isAnnotatingCuboid && (
        <ItemRight>
          {!currentFieldIsReadOnly && (
            <>
              <Undo />
              <Redo />
            </>
          )}
          {showMenu && (
            <>
              <IconButton
                size="small"
                onClick={handleMenuClick}
                sx={{ ml: 1 }}
                aria-label="label options"
              >
                <MoreVert />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={menuOpen}
                onClose={handleMenuClose}
                anchorOrigin={{
                  vertical: "bottom",
                  horizontal: "right",
                }}
                transformOrigin={{
                  vertical: "top",
                  horizontal: "right",
                }}
                sx={{
                  zIndex: 10000,
                }}
              >
                <MenuItem onClick={handleToggleReadOnly}>
                  {readOnlyOverride
                    ? "Re-enable read-only"
                    : "Disable read-only"}
                </MenuItem>
              </Menu>
            </>
          )}
        </ItemRight>
      )}
    </Row>
  );
};

export default Header;
