import {
  CancelOutlined,
  Close,
  EditOutlined,
  SaveOutlined,
} from "@mui/icons-material";
import {
  Box,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
  TypographyProps,
} from "@mui/material";
import React, { useState } from "react";

export default function EditableLabel(props: EditableLabelProps) {
  const {
    label,
    onSave,
    onCancel,
    labelProps = {},
    saving,
    showEditIcon = true,
  } = props;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [updatedLabel, setUpdatedLabel] = useState(label);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      {mode === "view" && <Typography {...labelProps}>{label}</Typography>}
      {mode === "edit" && (
        <TextField
          defaultValue={label}
          size="small"
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
                        onCancel();
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
      {mode === "view" && (
        <IconButton
          size="small"
          sx={{ opacity: showEditIcon ? 1 : 0, transition: "opacity 0.3s" }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMode("edit");
          }}
        >
          <EditOutlined sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Stack>
  );
}

type EditableLabelProps = {
  label: string;
  onSave: (newLabel: string) => void;
  onCancel: () => void;
  showEditIcon?: boolean;
  labelProps?: TypographyProps;
  saving?: boolean;
  mode?: "view" | "edit";
};
