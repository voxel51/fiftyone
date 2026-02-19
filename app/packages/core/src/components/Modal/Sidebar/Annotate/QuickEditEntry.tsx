import { useAnnotationController } from "@fiftyone/annotation";
import { Stack } from "@mui/material";
import { Clickable, Icon, IconName, Size } from "@voxel51/voodo";
import { FC, ReactNode } from "react";
import { useCanAnnotateField } from "./useCanAnnotateField";

type QuickEditEntryProps = {
  children: ReactNode;
  enabled: boolean;
  path: string;
};

/**
 * Renders the edit icon affordance for entering annotation mode.
 *
 * This is a separate component so that `useAnnotationController` (which
 * depends on schema-management operators) is only mounted when the current
 * user actually has annotation permissions.
 */
const QuickEditButton: FC<{ path: string }> = ({ path }) => {
  const { enterAnnotationMode } = useAnnotationController();

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
  const canAnnotate = useCanAnnotateField(path);

  return (
    <Stack
      sx={{ display: "inline-flex" }}
      direction="row"
      alignItems="center"
      gap={2}
    >
      {children}
      {enabled && canAnnotate && <QuickEditButton path={path} />}
    </Stack>
  );
};
