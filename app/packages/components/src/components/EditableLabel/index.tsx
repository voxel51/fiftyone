import {
  CancelOutlined,
  EditOutlined,
  SaveOutlined,
} from "@mui/icons-material";
import {
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
  TypographyProps,
} from "@mui/material";
import React, { useState } from "react";
import TooltipProvider from "../TooltipProvider";

export default function EditableLabel(props: EditableLabelProps) {
  const {
    label,
    onSave,
    onCancel,
    labelProps = {},
    saving,
    showEditIcon = true,
    disabled,
    title,
    multiline = false,
    minRows = 2,
    placeholder,
    iconPosition = "end",
    autoFocus = false,
  } = props;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [updatedLabel, setUpdatedLabel] = useState(label);

  // Seed the draft from the current label every time the editor opens so a
  // reopen (or a label prop that changed since the last edit) never submits
  // a stale draft — the input below is controlled by ``updatedLabel``.
  const openEditor = () => {
    setUpdatedLabel(label);
    setMode("edit");
  };

  // When a placeholder is supplied and the value is empty, render the
  // muted placeholder so the field stays a visible (clickable) target —
  // e.g. an unset description. Otherwise render exactly as before so
  // existing consumers are unaffected.
  const showPlaceholder = !label && placeholder !== undefined;
  const labelNode = showPlaceholder ? (
    <Typography
      {...labelProps}
      sx={[
        { color: (theme) => theme.palette.text.secondary },
        ...(Array.isArray(labelProps.sx) ? labelProps.sx : [labelProps.sx]),
      ]}
    >
      {placeholder}
    </Typography>
  ) : (
    <Typography {...labelProps}>{label}</Typography>
  );

  if (!showEditIcon) {
    return labelNode;
  }

  const editIcon = (
    <TooltipProvider title={title}>
      <IconButton
        size="small"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openEditor();
        }}
        disabled={disabled}
      >
        <EditOutlined sx={{ fontSize: 16 }} />
      </IconButton>
    </TooltipProvider>
  );

  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems={multiline ? "flex-start" : "center"}
    >
      {mode === "view" && iconPosition === "start" && editIcon}
      {mode === "view" && labelNode}
      {mode === "edit" && (
        <TextField
          value={updatedLabel}
          size="small"
          autoFocus={autoFocus}
          multiline={multiline}
          minRows={multiline ? minRows : undefined}
          placeholder={placeholder}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onChange={(e) => setUpdatedLabel(e.target.value)}
          InputProps={{
            endAdornment: (
              <Stack direction="row" alignItems="center">
                {saving ? (
                  <CircularProgress size={16} />
                ) : (
                  <>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMode("view");
                        onCancel?.();
                      }}
                    >
                      <CancelOutlined sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMode("view");
                        onSave(updatedLabel);
                      }}
                    >
                      <SaveOutlined sx={{ fontSize: 16 }} />
                    </IconButton>
                  </>
                )}
              </Stack>
            ),
          }}
          sx={{ backgroundColor: "#191919" }}
        />
      )}
      {mode === "view" && iconPosition === "end" && editIcon}
    </Stack>
  );
}

type EditableLabelProps = {
  label: string;
  onSave: (newLabel: string) => void;
  onCancel?: () => void;
  showEditIcon?: boolean;
  labelProps?: TypographyProps;
  saving?: boolean;
  mode?: "view" | "edit";
  disabled?: boolean;
  title?: string;
  /** Render a multiline (textarea) input in edit mode. Defaults to false. */
  multiline?: boolean;
  /** Minimum rows for the multiline input. Defaults to 2. */
  minRows?: number;
  /**
   * Placeholder for the input, and the muted text shown in view mode when
   * ``label`` is empty (so an empty field stays clickable).
   */
  placeholder?: string;
  /** Whether the edit pencil renders before or after the text. Default "end". */
  iconPosition?: "start" | "end";
  /** Focus the input when edit mode opens. Defaults to false. */
  autoFocus?: boolean;
};
