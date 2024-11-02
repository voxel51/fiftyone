import React, { useState } from "react";
import CircleIcon from "@mui/icons-material/Circle";
import { Chip, FormControl, MenuItem, Select, Tooltip } from "@mui/material";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";

const PillBadge = ({
  text,
  color = "default",
  variant = "filled",
  showIcon = true,
  operator,
  readOnly = false,
  tooltipTitle = "",
}: {
  text: string | string[] | [string, string][];
  color?: string;
  variant?: "filled" | "outlined";
  showIcon?: boolean;
  operator?: () => void;
  readOnly?: boolean;
  tooltipTitle?: string;
}) => {
  const getInitialChipSelection = (
    text: string | string[] | [string, string][]
  ) => {
    if (typeof text === "string") return text;
    if (Array.isArray(text)) {
      if (text.length === 0) return "";
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
      if (text.length === 0) return "default";
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

  const panelId = usePanelId();
  const handleClick = usePanelEvent();

  return (
    <span>
      <Tooltip title={tooltipTitle}>
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
              disabled={readOnly}
              icon={
                showIcon ? (
                  <CircleIcon color={"inherit"} sx={{ fontSize: 10 }} />
                ) : undefined
              }
              label={
                Array.isArray(text) &&
                text.length > 0 &&
                Array.isArray(text[0]) ? (
                  <Select
                    disabled={readOnly}
                    value={chipSelection}
                    variant={"standard"}
                    disableUnderline={true}
                    onChange={(event) => {
                      const selectedText = text.find(
                        (t) => t[0] === event.target.value
                      );
                      setChipSelection(event.target.value);
                      setChipColor(selectedText?.[1] ?? "default");
                      if (operator) {
                        handleClick(panelId, {
                          params: { value: event.target.value },
                          operator,
                        });
                      }
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
                    disabled={readOnly}
                    value={chipSelection}
                    variant={"standard"}
                    disableUnderline={true}
                    onChange={(event) => {
                      setChipSelection(event.target.value);
                      if (operator) {
                        handleClick(panelId, {
                          params: { value: event.target.value },
                          operator,
                        });
                      }
                    }}
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
      </Tooltip>
    </span>
  );
};

export default PillBadge;
