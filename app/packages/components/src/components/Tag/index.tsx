import React from "react";

import { useTheme } from "@mui/material/styles";
import { Box, Chip } from "@mui/material";

import CloseIcon from "@mui/icons-material/Close";

interface PropsType {
  title: string;
  label: string;
  onRemove?: () => void;
  readOnly?: boolean;
}

export default function Tag(props: PropsType) {
  const theme = useTheme();

  return (
    <Box
      display="flex"
      alignItems="center"
      sx={{
        background: theme.palette.background.item,
        borderRadius: "1rem",
        paddingRight: props.readOnly ? 0 : 1,
        marginRight: 0.5,
      }}
    >
      <Chip title={props.title} label={props.label} sx={{ height: 24 }} />
      {!props.readOnly && (
        <CloseIcon
          onClick={props?.onRemove}
          fontSize="medium"
          sx={{
            "&:hover": {
              cursor: "pointer",
            },
          }}
        />
      )}
    </Box>
  );
}
