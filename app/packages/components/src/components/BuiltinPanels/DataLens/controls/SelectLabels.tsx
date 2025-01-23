import { useOutsideClick } from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import CogIcon from "@mui/icons-material/Settings";
import { Checkbox, FormControlLabel, FormGroup } from "@mui/material";
import { useAtom } from "jotai";
import React, { useMemo, useRef, useState } from "react";
import IconButton from "../../../IconButton";
import Popout from "../../../Popout";
import {
  checkedFieldsAtom,
  isLabelTagsCheckedAtom,
  isSampleTagsCheckedAtom,
} from "../state";

interface SelectLabelsProps {
  schema: Schema;
}

const SelectLabelsList = ({
  fields,
  anchorRef,
  dismiss,
}: {
  fields: ReturnType<typeof getTopLevelFields>;
  anchorRef: React.RefObject<HTMLDivElement>;
  dismiss: () => void;
}) => {
  const [isSampleTagsChecked, setIsSampleTagsChecked] = useAtom(
    isSampleTagsCheckedAtom
  );
  const [isLabelTagsChecked, setIsLabelTagsChecked] = useAtom(
    isLabelTagsCheckedAtom
  );
  const [checkedFields, setCheckedFields] =
    useAtom<string[]>(checkedFieldsAtom);

  const popOutRef = useRef<HTMLDivElement>(null);

  useOutsideClick(popOutRef, (e) => {
    // if the click is on the cog icon, don't dismiss
    // (because dismissal is handled by the cog icon)
    if (anchorRef.current?.contains(e.target as Node)) return;

    dismiss();
  });

  return (
    <Popout modal fixed anchorRef={anchorRef} ref={popOutRef}>
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isSampleTagsChecked && isLabelTagsChecked}
              onChange={(e) => {
                setIsSampleTagsChecked(e.target.checked);
                setIsLabelTagsChecked(e.target.checked);
              }}
            />
          }
          label={"All Tags"}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isSampleTagsChecked}
              onChange={(e) => setIsSampleTagsChecked(e.target.checked)}
            />
          }
          label={"Sample Tags"}
          value={isSampleTagsChecked}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={isLabelTagsChecked}
              onChange={(e) => setIsLabelTagsChecked(e.target.checked)}
            />
          }
          label={"Label Tags"}
        />
      </FormGroup>
      <FormGroup
        sx={{ borderTop: "1px solid var(--fo-palette-background-level1)" }}
      >
        {fields.map((field) => (
          <FormControlLabel
            key={field}
            control={
              <Checkbox
                size="small"
                checked={checkedFields.includes(field)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCheckedFields([...checkedFields, field]);
                  } else {
                    setCheckedFields(checkedFields.filter((f) => f !== field));
                  }
                }}
              />
            }
            label={field}
          />
        ))}
      </FormGroup>
    </Popout>
  );
};

export const SelectLabels = ({ schema }: SelectLabelsProps) => {
  const [isLabelSelectorOpen, setIsLabelSelectorOpen] = useState(false);
  const cogRef = useRef<HTMLDivElement>(null);

  const fields = useMemo(() => getTopLevelFields(schema), [schema]);

  return (
    <div ref={cogRef}>
      <IconButton
        sx={{
          color: isLabelSelectorOpen
            ? "var(--fo-palette-primary)"
            : "var(--fo-palette-text-secondary)",
          "&:hover": {
            color: "var(--fo-palette-primary)",
          },
        }}
        onClick={() => setIsLabelSelectorOpen((prev) => !prev)}
      >
        <CogIcon />
      </IconButton>
      {isLabelSelectorOpen && (
        <SelectLabelsList
          fields={fields}
          anchorRef={cogRef}
          dismiss={() => {
            setIsLabelSelectorOpen(false);
          }}
        />
      )}
    </div>
  );
};

// todo: test with frame fields, add unit tests
function getTopLevelFields(schema: Schema): string[] {
  const result: string[] = [];

  for (const [key, value] of Object.entries(schema)) {
    // skip "tags"
    if (key === "tags") continue;

    // if it's metadata, expand subfields
    if (key === "metadata" && value.fields) {
      for (const subKey of Object.keys(value.fields)) {
        result.push(`metadata.${subKey}`);
      }
    } else {
      // otherwise, just add the top-level key
      result.push(key);
    }
  }

  // custom sort
  // everything else (alphabetical) -> metadata -> filepath -> id -> created_at -> last_modified_at
  const priorityOrder = [
    "metadata",
    "filepath",
    "id",
    "created_at",
    "last_modified_at",
  ];

  result.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);

    const inA = idxA !== -1;
    const inB = idxB !== -1;

    // if both in special list, compare by their index
    if (inA && inB) {
      return idxA - idxB;
    }
    // if only A is in list, B goes first
    if (inA && !inB) {
      return 1;
    }
    // if only B is in list, A goes first
    if (!inA && inB) {
      return -1;
    }
    // else neither is in special list: sort alphabetically
    return a.localeCompare(b);
  });

  return result;
}
