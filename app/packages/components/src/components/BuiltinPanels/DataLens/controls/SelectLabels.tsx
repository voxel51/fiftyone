import { useOutsideClick } from "@fiftyone/state";
import { Schema } from "@fiftyone/utilities";
import CogIcon from "@mui/icons-material/Settings";
import { Checkbox, FormControlLabel, FormGroup } from "@mui/material";
import { useAtom, useAtomValue } from "jotai";
import React, { useMemo, useRef, useState } from "react";
import IconButton from "../../../IconButton";
import Popout from "../../../Popout";
import { checkedFieldsAtom, currentViewAtom } from "../state";

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
              checked={
                checkedFields.includes("tags") &&
                checkedFields.includes("_label_tags")
              }
              onChange={(e) => {
                if (e.target.checked) {
                  setCheckedFields([...checkedFields, "tags", "_label_tags"]);
                } else {
                  setCheckedFields(
                    checkedFields.filter(
                      (f) => f !== "tags" && f !== "_label_tags"
                    )
                  );
                }
              }}
            />
          }
          label={"All Tags"}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={checkedFields.includes("tags")}
              onChange={(e) =>
                e.target.checked
                  ? setCheckedFields([...checkedFields, "tags"])
                  : setCheckedFields(checkedFields.filter((f) => f !== "tags"))
              }
            />
          }
          label={"Sample Tags"}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={checkedFields.includes("_label_tags")}
              onChange={(e) =>
                e.target.checked
                  ? setCheckedFields([...checkedFields, "_label_tags"])
                  : setCheckedFields(
                      checkedFields.filter((f) => f !== "_label_tags")
                    )
              }
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
  const viewMode = useAtomValue(currentViewAtom);
  const [isLabelSelectorOpen, setIsLabelSelectorOpen] = useState(false);
  const cogRef = useRef<HTMLDivElement>(null);

  const fields = useMemo(() => getTopLevelFields(schema), [schema]);

  if (viewMode === "json") return null;

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
  const specialFields = [
    "metadata",
    "filepath",
    "id",
    "created_at",
    "last_modified_at",
  ];
  const nonSpecialFields: string[] = [];

  for (const [key, value] of Object.entries(schema)) {
    // skip "tags", prepended elsewhere
    if (key === "tags") continue;

    // if it's metadata, expand subfields
    if (key === "metadata" && value.fields) {
      for (const subKey of Object.keys(value.fields)) {
        result.push(`metadata.${subKey}`);
      }
    } else if (!specialFields.includes(key)) {
      nonSpecialFields.push(key);
    }
  }

  nonSpecialFields.sort();

  return [
    ...nonSpecialFields,
    ...result,
    ...specialFields.filter((field) => field !== "metadata"),
  ];
}
