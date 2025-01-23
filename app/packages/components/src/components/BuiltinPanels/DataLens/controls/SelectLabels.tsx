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

interface SelectLabelsListProps {
  fields: string[];
  anchorRef: React.RefObject<HTMLDivElement>;
  dismiss: () => void;
}

const FieldCheckbox = ({ field, label }: { field: string; label?: string }) => {
  const [checkedFields, setCheckedFields] = useAtom(checkedFieldsAtom);

  const isChecked = checkedFields.includes(field);

  const toggleField = () => {
    const updatedFields = new Set(checkedFields);
    isChecked ? updatedFields.delete(field) : updatedFields.add(field);
    setCheckedFields(Array.from(updatedFields));
  };

  return (
    <FormControlLabel
      key={field}
      control={
        <Checkbox size="small" checked={isChecked} onChange={toggleField} />
      }
      label={label ?? field}
    />
  );
};

const AllTagsCheckbox = ({
  checkedFields,
  setCheckedFields,
}: {
  checkedFields: Set<string>;
  setCheckedFields: (fields: Set<string>) => void;
}) => {
  const isAllTagsChecked =
    checkedFields.has("tags") && checkedFields.has("_label_tags");

  const toggleAllTags = () => {
    const updatedFields = new Set(checkedFields);
    if (isAllTagsChecked) {
      updatedFields.delete("tags");
      updatedFields.delete("_label_tags");
    } else {
      updatedFields.add("tags");
      updatedFields.add("_label_tags");
    }
    setCheckedFields(updatedFields);
  };

  return (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={isAllTagsChecked}
          onChange={toggleAllTags}
        />
      }
      label="All Tags"
    />
  );
};

const SelectLabelsList: React.FC<SelectLabelsListProps> = ({
  fields,
  anchorRef,
  dismiss,
}) => {
  const [checkedFields, setCheckedFields] = useAtom(checkedFieldsAtom);
  const popOutRef = useRef<HTMLDivElement>(null);

  useOutsideClick(popOutRef, (e) => {
    if (anchorRef.current?.contains(e.target as Node)) return;
    dismiss();
  });

  const updateCheckedFields = (fields: Set<string>) =>
    setCheckedFields(Array.from(fields));

  return (
    <Popout modal fixed anchorRef={anchorRef} ref={popOutRef}>
      <FormGroup>
        <AllTagsCheckbox
          checkedFields={new Set(checkedFields)}
          setCheckedFields={updateCheckedFields}
        />
        <FieldCheckbox field="tags" label="Sample Tags" />
        <FieldCheckbox field="_label_tags" label="Label Tags" />
      </FormGroup>
      <FormGroup
        sx={{ borderTop: "1px solid var(--fo-palette-background-level1)" }}
      >
        {fields.map((field) => (
          <FieldCheckbox key={field} field={field} />
        ))}
      </FormGroup>
    </Popout>
  );
};

export const SelectLabels: React.FC<SelectLabelsProps> = ({ schema }) => {
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
          dismiss={() => setIsLabelSelectorOpen(false)}
        />
      )}
    </div>
  );
};

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
