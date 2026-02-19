import { useAnnotationController } from "@fiftyone/annotation";
import { Stack } from "@mui/material";
import { Clickable, Icon, IconName, Size } from "@voxel51/voodo";
import { FC, ReactNode } from "react";
import { useCanAnnotateField } from "./useCanAnnotateField";
import useCanAnnotate from "./useCanAnnotate";

type QuickEditEntryProps = {
  children: ReactNode;
  enabled: boolean;
  path: string;
};

/**
 * Inner component that uses annotation-dependent hooks.
 * Only mounted when the user has base annotation permission,
 * avoiding lookups of operators that are not enabled.
 */
const QuickEditAction: FC<{ path: string }> = ({ path }) => {
  const canAnnotateField = useCanAnnotateField(path);
  const { enterAnnotationMode } = useAnnotationController();

  if (!canAnnotateField) {
    return null;
  }

  return (
    <Clickable onClick={() => enterAnnotationMode(path)}>
      <Icon name={IconName.Edit} size={Size.Sm} />
    </Clickable>
  );
};

/**
 * Component which provides entry into annotation mode via "quick-edit" flow.
 *
 * @param children Content to wrap; entry affordance will be adjacent
 * @param enabled If true, entry affordance will be visible if the path is a valid annotation field
 * @param path Sample path
 */
export const QuickEditEntry: FC<QuickEditEntryProps> = ({
  children,
  enabled,
  path,
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
      {enabled && canAnnotate && <QuickEditAction path={path} />}
    </Stack>
  );
};
