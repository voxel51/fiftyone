import React, { useState } from "react";
import CircleIcon from "@mui/icons-material/Circle";
import { Chip, FormControl, MenuItem, Select } from "@mui/material";

const PillBadge = ({
  text,
  color = "default",
  variant = "filled",
  showIcon = true,
}: {
  text: string | string[] | [string, string][];
  color?: string;
  variant?: "filled" | "outlined";
  showIcon?: boolean;
}) => {
  const getInitialChipSelection = (
    text: string | string[] | [string, string][]
  ) => {
    if (typeof text === "string") return text;
    if (Array.isArray(text)) {
      if (Array.isArray(text[0])) return text[0][0];
      return text[0];
    }
    return "";
  };

  const getInitialChipColor = (
    text: string | string[] | [string, string][],
    color?: string
  ) => {
    if (typeof text === "string") return color;
    if (Array.isArray(text)) {
      if (Array.isArray(text[0])) return text[0][1];
      return color || "default";
    }
    return "default";
  };

  const [chipSelection, setChipSelection] = useState(
    getInitialChipSelection(text)
  );
  const [chipColor, setChipColor] = useState(getInitialChipColor(text, color));

  const COLORS: { [key: string]: string } = {
    default: "#999999",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };

  const chipStyle: { [key: string]: string | number } = {
    color: COLORS[chipColor || "default"] || COLORS.default,
    fontSize: 14,
    fontWeight: 500,
    paddingLeft: 1,
  };

  return (
    <span>
      {typeof text === "string" ? (
        <Chip
          icon={
            showIcon ? (
              <CircleIcon color={"inherit"} sx={{ fontSize: 10 }} />
            ) : undefined
          }
          label={text}
          sx={{
            ...chipStyle,
            "& .MuiChip-icon": {
              marginRight: "-7px",
            },
            "& .MuiChip-label": {
              marginBottom: "1px",
            },
          }}
          variant={variant as "filled" | "outlined" | undefined}
        />
      ) : (
        <FormControl fullWidth>
          <Chip
            icon={
              showIcon ? (
                <CircleIcon color={"inherit"} sx={{ fontSize: 10 }} />
              ) : undefined
            }
            label={
              Array.isArray(text) && text.length > 0 && Array.isArray(text[0]) ? (
                <Select
                  value={chipSelection}
                  variant={"standard"}
                  disableUnderline={true}
                  onChange={(event) => {
                    const selectedText = text.find(
                      (t) => t[0] === event.target.value
                    );
                    setChipSelection(event.target.value);
                    setChipColor(selectedText?.[1] ?? "default");
                  }}
                  sx={{
                    color: "inherit",
                  }}
                >
                  {text.map((t, index) => (
                    <MenuItem key={index} value={t[0]}>
                      {t[0]}
                    </MenuItem>
                  ))}
                </Select>
              ) : (
                <Select
                  value={chipSelection}
                  variant={"standard"}
                  disableUnderline={true}
                  onChange={(event) => setChipSelection(event.target.value)}
                  sx={{
                    color: "inherit",
                  }}
                >
                  {text.map((t, index) => (
                    <MenuItem key={index} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              )
            }
            sx={{
              ...chipStyle,
              "& .MuiChip-icon": {
                marginRight: "-7px",
              },
              "& .MuiChip-label": {
                marginBottom: "1px",
              },
              "& .MuiInput-input:focus": {
                backgroundColor: "inherit",
              },
            }}
            variant={variant as "filled" | "outlined" | undefined}
          ></Chip>
        </FormControl>
      )}
    </span>
  );
};

export default PillBadge;
