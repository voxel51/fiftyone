import React, { useCallback, useState } from "react";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import { Tag } from "@fiftyone/components";

import { uniqBy } from "lodash";

interface TagType {
  value: string;
  label: string;
}

interface PropsType {
  direction?: "h" | "v";
  disabled?: boolean;
  onChange?: (labels: string[]) => void;
  autoSave?: boolean;
  initialValues?: TagType[];
  placeholder?: string;
}

export default function TagsInput(props: PropsType) {
  const {
    initialValues = [],
    direction,
    onChange,
    disabled,
    placeholder,
  } = props;
  const [input, setInput] = useState("");

  const dir = direction || "v";
  const isVertical = dir === "v";

  const [tags, setTags] = useState<TagType[]>(initialValues);

  const updateNewTags = useCallback(
    (newTags: Array<TagType>) => {
      const uniqueTags = getUniqueTags(newTags);
      setTags(uniqueTags);
      onChange && onChange(uniqueTags?.map((tag) => tag.value));
    },
    [setTags, onChange]
  );

  const handleRemoveTag = useCallback(
    (tagLabel: string) => {
      const filteredTags = tags.filter(
        ({ label }: TagType) => label !== tagLabel
      );
      updateNewTags(filteredTags);
    },
    [tags, updateNewTags]
  );

  return (
    <Box
      display="flex"
      flexDirection={isVertical ? "column" : "row"}
      pt={2}
      width="100%"
      flex="3"
    >
      <Typography
        variant="body1"
        fontWeight="medium"
        noWrap
        pb={1}
        pl={0}
        flex="1"
      >
        Tags
      </Typography>
      <Box display="flex" flex="3" width="100%">
        <Autocomplete
          autoHighlight
          freeSolo
          value={tags}
          disabled={!!disabled}
          multiple
          limitTags={4}
          id="multiple-limit-tags"
          getOptionLabel={(option: TagType) => option?.value}
          isOptionEqualToValue={(option: TagType, value: TagType) => {
            return option.value === value.value;
          }}
          renderOption={(props, option) => <li {...props}>{option.label}</li>}
          noOptionsText="+ create a new tag"
          disableCloseOnSelect
          options={[]}
          inputValue={input}
          renderInput={(params) => (
            <TextField
              {...params}
              InputProps={{
                ...params.InputProps,
              }}
              placeholder={
                !!disabled
                  ? ""
                  : placeholder ??
                    "Type to add tags. Use comma or tab to add multiple"
              }
            />
          )}
          // onFocus={() => setDatasetTagSearchTerm("")}
          sx={{ width: "100%", display: "flex", flex: "2" }}
          onInputChange={(e: any) => {
            const val = e?.target?.value;
            if (val && !val.endsWith(",")) {
              setInput(val);
            } else {
              setInput("");
            }
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => {
            // when creating new tags
            if (
              event.code === "Enter" ||
              event.code === "Comma" ||
              event.code === "Tab"
            ) {
              event.preventDefault();
              const newTag = input?.split(",")?.[0];

              if (newTag) {
                updateNewTags([...tags, { label: newTag, value: newTag }]);
              }
              setInput("");
            }
          }}
          clearOnEscape
          onChange={(_, values) => {
            const currentValues = values.map((value) =>
              typeof value === "string" ? { value, label: value } : value
            );
            updateNewTags(currentValues);
            setInput("");
          }}
          renderTags={(tagValue) =>
            tagValue.map((option) => (
              <Tag
                key={option.value}
                label={option.value}
                title={option.label}
                onRemove={() => handleRemoveTag(option.label)}
                readOnly={!!disabled}
              />
            ))
          }
        />
      </Box>
    </Box>
  );
}

function getUniqueTags(tags: Array<TagType>) {
  return uniqBy(tags, "value");
}
