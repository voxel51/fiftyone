import { useCallback, useRef, useState } from "react";
import { Round } from "../Actions";

import { DetectionOverlay, useLighter } from "@fiftyone/lighter";
import { West as Back } from "@mui/icons-material";
import { Box, Menu, MenuItem, Stack } from "@mui/material";
import { Clickable, Icon, IconName, Size, Text } from "@voxel51/voodo";
import { DETECTION } from "@fiftyone/utilities";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { Row } from "./Components";

import { useLabelsCount } from "../useLabels";
import * as fos from "@fiftyone/state";
import { isGeneratedView, ModalMode } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useSchemaManagerModal } from "../SchemaManager/hooks";
import { useAnnotationContext } from "./useAnnotationContext";
import {
  useActivePrimitive,
  usePrimitiveEditOriginMode,
} from "./useActivePrimitive";

import { KnownCommands, KnownContexts, useCommand } from "@fiftyone/commands";
import useColor from "./useColor";
import useExit from "./useExit";
import { useDetectionMode } from "./useDetectionMode";
import { useSegmentationMode } from "./useSegmentationMode";
import { useAnnotationController } from "@fiftyone/annotation";

const LabelHamburgerMenu = () => {
  const [open, setOpen] = useState<boolean>(false);
  const anchor = useRef<HTMLElement | null>(null);

  const deleteCommand = useCommand(
    KnownCommands.ModalDeleteAnnotation,
    KnownContexts.ModalAnnotate,
  );

  // Permission and read-only state
  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const { selected, setData } = useAnnotationContext();
  const currentFieldIsReadOnly = selected?.isFieldReadOnly ?? false;
  const { openSchemaManager } = useSchemaManagerModal();
  const isGenerated = useRecoilValue(isGeneratedView);

  // Mask state
  const type = selected?.type ?? null;
  const data = selected?.data;
  const overlay = selected?.overlay;
  const { isEditingMask } = useSegmentationMode();

  // `mask`/`mask_path` are Detection-only fields; the union narrows them
  // out. Cast at the access site.
  const maskFields = data as { mask?: unknown; mask_path?: unknown } | null;
  const isMaskDetection = !!(
    maskFields?.mask ||
    maskFields?.mask_path ||
    isEditingMask
  );
  const isDetection = type === DETECTION;

  const handleAddMask = useCallback(() => {
    if (overlay instanceof DetectionOverlay) {
      overlay.initMask();
      setOpen(false);
    }
  }, [overlay]);

  const handleRemoveMask = useCallback(() => {
    if (overlay instanceof DetectionOverlay) {
      overlay.removeMask();
      setData({ mask: undefined, mask_path: undefined });
      setOpen(false);
    }
  }, [overlay, setData]);

  const handleOpenSchemaManager = () => {
    openSchemaManager();
    setOpen(false);
  };

  const showEditSchema = canEditLabels.enabled && currentFieldIsReadOnly;
  const showDelete = !isGenerated;
  const showAddMask =
    isDetection && !isMaskDetection && !currentFieldIsReadOnly;
  const showRemoveMask =
    isDetection && isMaskDetection && !currentFieldIsReadOnly;
  const hasMenuItems =
    showDelete || showEditSchema || showAddMask || showRemoveMask;

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
        {showAddMask && <MenuItem onClick={handleAddMask}>Add mask</MenuItem>}
        {showRemoveMask && (
          <MenuItem onClick={handleRemoveMask}>Remove mask</MenuItem>
        )}
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
  const annotationContext = useAnnotationContext();
  const { selected } = annotationContext;
  const type = selected?.type ?? null;
  const Icon = ICONS[type?.toLowerCase() ?? ""];
  const color = useColor(selected?.overlay ?? undefined);

  const { exitAnnotationMode } = useAnnotationController();
  const [activePrimitive] = useActivePrimitive();
  const [primitiveEditOriginMode, clearPrimitiveEditOriginMode] =
    usePrimitiveEditOriginMode();
  const onExit = useExit();
  const { scene } = useLighter();
  const { deactivateDetectionMode } = useDetectionMode();
  const currentFieldIsReadOnly = selected?.isFieldReadOnly ?? false;

  // In patches view with single label, clicking back should go to explore mode.
  // Also exit to explore when a primitive edit was initiated from explore mode.
  const isPatches = useRecoilValue(fos.isPatchesView);
  const labelCount = useLabelsCount();
  const shouldExitToExplore =
    (isPatches && labelCount === 1) ||
    (activePrimitive !== null && primitiveEditOriginMode === ModalMode.EXPLORE);

  const handleExit = useCallback(() => {
    clearPrimitiveEditOriginMode(null);
    if (shouldExitToExplore) {
      exitAnnotationMode();
    }
    deactivateDetectionMode();
    scene?.exitInteractiveMode();
    onExit();
  }, [
    shouldExitToExplore,
    exitAnnotationMode,
    onExit,
    deactivateDetectionMode,
    scene,
  ]);

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
          {annotationContext.selected?.label != null && <LabelHamburgerMenu />}
        </Stack>
      </ItemRight>
    </Row>
  );
};

export default Header;
