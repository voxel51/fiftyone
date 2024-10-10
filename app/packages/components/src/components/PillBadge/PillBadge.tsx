import React, { useState } from "react";
import CircleIcon from "@mui/icons-material/Circle";
import { Chip, FormControl, MenuItem, Select } from "@mui/material";

const PillBadge = ({
  text,
  color,
  variant = "filled",
  showIcon = true,
}: {
  text: string | string[] | [string, string][];
  color?: string;
  variant?: "filled" | "outlined";
  showIcon?: boolean;
}) => {
  const [chipSelection, setChipSelection] = useState(
    typeof text === "string"
      ? text
      : Array.isArray(text)
      ? Array.isArray(text[0])
        ? text[0][0]
        : text[0]
      : ""
  );
  const COLORS: { [key: string]: string } = {
    default: "#999999",
    primary: "#FFB682",
    error: "error",
    warning: "warning",
    info: "info",
    success: "#8BC18D",
  };

  const chipStyle: { [key: string]: string | number } = {
    color: COLORS[color || "default"],
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
              Array.isArray(text) && Array.isArray(text[0]) ? (
                <Select
                  value={chipSelection}
                  variant={"standard"}
                  disableUnderline={true}
                  onChange={(event) =>
                    setChipSelection(event.target.value as string)
                  }
                  sx={{
                    color: COLORS[color || "default"],
                    boxShadow: "none",
                    textShadow: "none",
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
                  onChange={(event) =>
                    setChipSelection(event.target.value as string)
                  }
                  sx={{
                    color: COLORS[color || "default"],
                    boxShadow: "none",
                    textShadow: "none",
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
            }}
            variant={variant as "filled" | "outlined" | undefined}
          ></Chip>
        </FormControl>
      )}
    </span>
  );
};

export default PillBadge;
