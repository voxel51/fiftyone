import { useAtomValue } from "jotai";
import { useCallback, useRef, useState } from "react";
import { Round } from "../Actions";

import { useLighter } from "@fiftyone/lighter";
import { West as Back } from "@mui/icons-material";
import { Menu, MenuItem, Stack } from "@mui/material";
import {
  Anchor,
  Icon,
  IconName,
  Size,
  Text,
  TextBadge,
  TextColor,
  TextVariant,
  Tooltip,
} from "@voxel51/voodo";
import { ItemLeft, ItemRight } from "../Components";
import { ICONS } from "../Icons";
import { Row } from "./Components";

import * as fos from "@fiftyone/state";
import { isGeneratedView } from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { useSchemaManagerModal } from "../SchemaManager/hooks";
import {
  currentFieldIsReadOnlyAtom,
  currentOverlay,
  currentType,
  useAnnotationContext,
} from "./state";

import { KnownCommands, KnownContexts, useCommand } from "@fiftyone/commands";
import useColor from "./useColor";
import useExit from "./useExit";
import { useQuickDraw } from "./useQuickDraw";
import { useAnnotationController } from "@fiftyone/annotation";

import { labels } from "../useLabels";

const LabelHamburgerMenu = () => {
  const [open, setOpen] = useState<boolean>(false);
  const anchor = useRef<HTMLElement | null>(null);

  const deleteCommand = useCommand(
    KnownCommands.ModalDeleteAnnotation,
    KnownContexts.ModalAnnotate
  );

  const canEditLabels = useRecoilValue(fos.canEditLabels);
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);
  const { openSchemaManager } = useSchemaManagerModal();
  const isGenerated = useRecoilValue(isGeneratedView);

  const handleOpenSchemaManager = () => {
    openSchemaManager();
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
      <Tooltip content="More options" anchor={Anchor.Top} portal>
        <Round ref={anchor} onClick={() => setOpen(true)}>
          <Icon name={IconName.MoreVertical} size={Size.Md} />
        </Round>
      </Tooltip>

      <Menu
        anchorEl={anchor.current}
        open={open}
        onClose={() => setOpen(false)}
        sx={{ zIndex: 9999 }}
      >
        {showDelete && (
          <MenuItem onClick={deleteCommand.callback}>
            <Stack direction="row" gap={1} alignItems="center">
              <Icon name={IconName.Delete} size={Size.Sm} />
              <Text variant={TextVariant.Sm}>
                {deleteCommand.descriptor.label}
              </Text>
            </Stack>
          </MenuItem>
        )}
        {showEditSchema && (
          <MenuItem onClick={handleOpenSchemaManager}>
            <Text variant={TextVariant.Sm}>Edit field schema</Text>
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

  const { exitAnnotationMode } = useAnnotationController();
  const onExit = useExit();
  const { scene } = useLighter();
  const { disableQuickDraw } = useQuickDraw();
  const annotationContext = useAnnotationContext();
  const currentFieldIsReadOnly = useAtomValue(currentFieldIsReadOnlyAtom);

  const isPatches = useRecoilValue(fos.isPatchesView);
  const labelCount = useAtomValue(labels).length;
  const shouldExitToExplore = isPatches && labelCount === 1;

  const handleExit = useCallback(() => {
    if (shouldExitToExplore) {
      exitAnnotationMode();
    }
    disableQuickDraw();
    scene?.exitInteractiveMode();
    onExit();
  }, [
    shouldExitToExplore,
    exitAnnotationMode,
    onExit,
    disableQuickDraw,
    scene,
  ]);

  return (
    <Row>
      <ItemLeft style={{ columnGap: "0.5rem" }}>
        <Tooltip content="Back" anchor={Anchor.Top} portal>
          <Round onClick={handleExit}>
            <Back />
          </Round>
        </Tooltip>
        {Icon && <Icon fill={color} />}
        <div>Edit {type}</div>
      </ItemLeft>
      {currentFieldIsReadOnly && (
        <TextBadge color={TextColor.Muted}>Read-only</TextBadge>
      )}
      <ItemRight>
        <Stack direction="row" alignItems="center">
          {annotationContext.selectedLabel !== null && <LabelHamburgerMenu />}
        </Stack>
      </ItemRight>
    </Row>
  );
};

export default Header;
