import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import { Redo, Round, Undo } from "../Actions";

import { useLighter } from "@fiftyone/lighter";
import { West as Back } from "@mui/icons-material";
import { Box, Menu, MenuItem, Stack } from "@mui/material";
import { Clickable, Icon, IconName, Size, Text } from "@voxel51/voodo";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { Row } from "./Components";

import { labels } from "../useLabels";
import * as fos from "@fiftyone/state";
import { isGeneratedView } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { showModal } from "../state";
import {
  currentFieldIsReadOnlyAtom,
  currentOverlay,
  currentType,
  useAnnotationContext,
} from "./state";

import { KnownCommands, KnownContexts, useCommand } from "@fiftyone/commands";
import { useCurrent3dAnnotationMode } from "@fiftyone/looker-3d/src/state/accessors";
import useColor from "./useColor";
import useExit from "./useExit";
import { useQuickDraw } from "./useQuickDraw";

const LabelHamburgerMenu = () => {
  const [open, setOpen] = useState<boolean>(false);
  const anchor = useRef<HTMLElement | null>(null);

  const deleteCommand = useCommand(
    KnownCommands.ModalDeleteAnnotation,
    KnownContexts.ModalAnnotate
  );

  // Permission and read-only state
  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const setShowSchemaManager = useSetAtom(showModal);
  const isGenerated = useRecoilValue(isGeneratedView);

  const handleOpenSchemaManager = () => {
    setShowSchemaManager(true);
    setOpen(false);
  };

  const showEditSchema = canEditLabels.enabled && currentFieldIsReadOnly;
  const showDelete = !isGenerated;
  const hasMenuItems = showDelete || showEditSchema;

  if (!hasMenuItems) {
    return null;
  }

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
        {showDelete && (
          <MenuItem onClick={deleteCommand.callback}>
            <Stack direction="row" gap={1} alignItems="center">
              <Icon name={IconName.Delete} size={Size.Md} />
              <Text>{deleteCommand.descriptor.label}</Text>
            </Stack>
          </MenuItem>
        )}
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
  const { scene } = useLighter();
  const { disableQuickDraw } = useQuickDraw();
  const annotationContext = useAnnotationContext();
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);

  const current3dAnnotationMode = useCurrent3dAnnotationMode();
  const isAnnotatingPolyline = current3dAnnotationMode === "polyline";
  const isAnnotatingCuboid = current3dAnnotationMode === "cuboid";

  // In patches view with single label, clicking back should go to explore mode
  const isPatches = useRecoilValue(fos.isPatchesView);
  const labelCount = useAtomValue(labels).length;
  const setModalMode = useSetAtom(fos.modalMode);
  const shouldExitToExplore = isPatches && labelCount === 1;

  const handleExit = useCallback(() => {
    if (shouldExitToExplore) {
      void setModalMode(fos.ModalMode.EXPLORE);
    }
    disableQuickDraw();
    scene?.exitInteractiveMode();
    onExit();
  }, [shouldExitToExplore, setModalMode, onExit, disableQuickDraw, scene]);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Round onClick={handleExit}>
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
