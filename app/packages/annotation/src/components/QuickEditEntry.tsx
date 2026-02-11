import { Clickable, Icon, IconName, Size } from "@voxel51/voodo";
import { Stack } from "@mui/material";
import { FC, ReactNode } from "react";
import { useAnnotationController } from "../hooks";
import { useCanAnnotateField } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/useCanAnnotateField";

type QuickEditEntryProps = {
  children: ReactNode;
  enabled: boolean;
  path: string;
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
  const { enterAnnotationMode } = useAnnotationController();

  return (
    <Stack
      sx={{ display: "inline-flex" }}
      direction="row"
      alignItems="center"
      gap={2}
    >
      {children}
      {enabled && canAnnotate && (
        <Clickable onClick={() => enterAnnotationMode(path)}>
          <Icon name={IconName.Edit} size={Size.Sm} />
        </Clickable>
      )}
    </Stack>
  );
};
