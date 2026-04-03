import {
  gridSortBy,
  gridSortFields,
  queryPerformance,
  similarityParameters,
} from "@fiftyone/state";
import { ArrowDownward, ArrowUpward, OpenInNew } from "@mui/icons-material";
import { ListItemIcon, ListItemText, MenuItem, Select } from "@mui/material";
import React from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { SORT_BY_INDEXED_FIELDS } from "../../../utils/links";
import { IconButton, SliderContainer } from "./Containers";

export default function Sort() {
  const fields = useRecoilValue(gridSortFields);
  const [value, select] = useRecoilState(gridSortBy);
  const similarity = useRecoilValue(similarityParameters);
  const isQPEnabled = useRecoilValue(queryPerformance);

  if (!fields.length || similarity) {
    return null;
  }

  return (
    <SliderContainer style={{ width: "auto", gap: "0.25rem" }}>
      <Select
        value={value?.field ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            select(null);
            return;
          }
          select((current) => ({
            field: v,
            descending: Boolean(current?.descending),
          }));
        }}
        displayEmpty
        size="small"
        variant="outlined"
        sx={{
          fontSize: "0.8rem",
          fontWeight: "bold",
          color: "text.secondary",
          height: 28,
          "& .MuiOutlinedInput-notchedOutline": { border: "none" },
          "&:hover .MuiOutlinedInput-notchedOutline": { border: "none" },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": { border: "none" },
          "& .MuiSelect-icon": { color: "text.secondary" },
        }}
      >
        <MenuItem value="" sx={{ fontSize: "0.8rem", fontStyle: "italic" }}>
          Sort by
        </MenuItem>
        {fields.map((field) => (
          <MenuItem key={field} value={field} sx={{ fontSize: "0.8rem" }}>
            {field}
          </MenuItem>
        ))}
        {isQPEnabled && (
          <MenuItem
            component="a"
            href={SORT_BY_INDEXED_FIELDS}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ fontSize: "0.8rem", borderTop: "1px solid", borderColor: "divider", mt: 0.5 }}
          >
            <ListItemText primary="Add indexed fields" primaryTypographyProps={{ fontSize: "0.8rem" }} />
            <ListItemIcon sx={{ minWidth: "unset", ml: 1 }}>
              <OpenInNew sx={{ fontSize: "0.9rem" }} />
            </ListItemIcon>
          </MenuItem>
        )}
      </Select>
      {value !== null && (
        <IconButton
          title={value?.descending ? "Descending" : "Ascending"}
          onClick={() =>
            select((current) => ({
              ...current,
              descending: !current.descending,
            }))
          }
        >
          {value?.descending ? <ArrowDownward /> : <ArrowUpward />}
        </IconButton>
      )}
    </SliderContainer>
  );
}
