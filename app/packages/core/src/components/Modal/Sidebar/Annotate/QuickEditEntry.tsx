import { useAnnotationController } from "@fiftyone/annotation";
import { Stack } from "@mui/material";
import { Button, Clickable, Icon, IconName, Size } from "@voxel51/voodo";
import React, { FC, ReactNode } from "react";
import { useCanAnnotateField } from "./useCanAnnotateField";
import useCanAnnotate from "./useCanAnnotate";

type QuickEditActionType = "icon" | "button";

type QuickEditEntryProps = {
  children?: ReactNode;
  enabled: boolean;
  labelId?: string;
  onClick?: () => void;
  path: string;
  type?: QuickEditActionType;
};

const EditIcon = ({ ...props }) => <Icon name={IconName.Edit} {...props} />;

/**
 * Inner component that uses annotation-dependent hooks.
 * Only mounted when the user has base annotation permission,
 * avoiding lookups of operators that are not enabled.
 */
const QuickEditAction: FC<{
  labelId?: string;
  onClick?: () => void;
  path: string;
  type?: QuickEditActionType;
}> = ({ labelId, onClick, path, type = "icon" }) => {
  const canAnnotateField = useCanAnnotateField(path);
  const { enterAnnotationMode } = useAnnotationController();

  if (!canAnnotateField) {
    return null;
  }

  return type === "icon" ? (
    <Clickable
      onClick={() => {
        enterAnnotationMode(path, labelId);
        onClick?.();
      }}
    >
      <EditIcon size={Size.Sm} />
    </Clickable>
  ) : (
    <Button
      leadingIcon={EditIcon}
      size={Size.Xs}
      onClick={() => {
        enterAnnotationMode(path, labelId);
        onClick?.();
      }}
    ></Button>
  );
};

/**
 * Component which provides entry into annotation mode via "quick-edit" flow.
 *
 * @param children Content to wrap; entry affordance will be adjacent
 * @param enabled If true, entry affordance will be visible if the path is a valid annotation field
 * @param labelId Optional labelId to activate on entry
 * @param onClick Optional callback triggered when entry is clicked
 * @param path Sample path
 * @param type Type of entry to display
 */
export const QuickEditEntry: FC<QuickEditEntryProps> = ({
  children,
  enabled,
  labelId,
  onClick,
  path,
  type = "icon",
}) => {
  const { showAnnotationTab: canAnnotate } = useCanAnnotate();

  return (
    <Stack
      sx={{ display: "inline-flex" }}
      direction="row"
      alignItems="center"
      gap={2}
    >
      {children}
      {enabled && canAnnotate && (
        <QuickEditAction
          labelId={labelId}
          onClick={onClick}
          path={path}
          type={type}
        />
      )}
    </Stack>
  );
};
