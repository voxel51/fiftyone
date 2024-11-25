import { useMutation } from "@fiftyone/hooks";
import { Box, TextInput } from "@fiftyone/teams-components";
import {
  runsRenameRunMutation,
  runsRenameRunMutationT,
} from "@fiftyone/teams-state";
import {
  DEFAULT_ANIMATION_DURATION,
  DEFAULT_SECONDARY_ANIMATION_DURATION,
} from "@fiftyone/teams-state/src/constants";
import { Cancel, Edit, Save } from "@mui/icons-material";
import { CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";

export default function RunLabel(props: RunLabelPropsType) {
  const { id, label, isHovering, refresh, pinned } = props;
  const [editing, setEditing] = useState(false);
  const [rename, renaming] = useMutation<runsRenameRunMutationT>(
    runsRenameRunMutation
  );
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const labelInputElem = labelInputRef.current;
    if (editing && labelInputElem) labelInputElem.focus();
  }, [editing]);

  const handleSave = useCallback(() => {
    rename({
      variables: {
        operationId: id,
        label: labelInputRef.current?.value as string,
      },
      onSuccess() {
        setEditing(false);
        if (refresh) refresh();
      },
      successMessage: "Successfully renamed the run",
      errorMessage: "Failed to rename the run",
    });
  }, [rename, id, refresh]);

  if (editing)
    return (
      <TextInput
        inputRef={labelInputRef}
        defaultValue={label}
        focused
        onClick={(e) => {
          e.stopPropagation();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(false);
          }
          if (e.key === "Enter") {
            handleSave();
          }
        }}
        InputProps={{
          endAdornment: renaming ? (
            <CircularProgress size={16} color="secondary" />
          ) : (
            <Stack direction="row">
              <IconButton
                title="Cancel changes"
                size="small"
                onClick={() => {
                  setEditing(false);
                }}
              >
                <Cancel color="secondary" />
              </IconButton>
              <IconButton
                title="Save changes"
                size="small"
                onClick={handleSave}
              >
                <Save />
              </IconButton>
            </Stack>
          ),
        }}
      />
    );

  const duration = DEFAULT_ANIMATION_DURATION;
  const durationSecondary = DEFAULT_SECONDARY_ANIMATION_DURATION;

  return (
    <>
      <Typography variant="body2">{label}</Typography>
      <Box
        sx={{
          visibility: !isHovering ? "hidden" : "visible",
          opacity: !isHovering ? "0" : "1",
          transition:
            `visibility 0s, opacity ${duration}s linear, margin` +
            ` ${durationSecondary}s linear`,
          marginLeft: pinned && !isHovering ? "-24px!important" : undefined,
        }}
      >
        <IconButton
          title="Edit label"
          color="secondary"
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          <Edit />
        </IconButton>
      </Box>
    </>
  );
}

type RunLabelPropsType = {
  id: string;
  label: string;
  isHovering?: boolean;
  refresh?: () => void;
  pinned?: boolean;
};
