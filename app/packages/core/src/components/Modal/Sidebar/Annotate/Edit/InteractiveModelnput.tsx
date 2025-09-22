import { Autocomplete, Button, Stack, TextField } from "@mui/material";
import { useAtom, useAtomValue } from "jotai";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { activeSchemas } from "../state";
import { interactiveModeInput } from "./state";

const NewBoundingBox = ({
  payload,
  onDismiss,
  onComplete,
}: {
  payload: { x: number; y: number };
  onDismiss: () => void;
  onComplete: (value: any) => void;
}) => {
  const activeSchemasVal = useAtomValue(activeSchemas);
  const [labelName, setLabelName] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);

  const activeFields = useMemo(
    () => Object.keys(activeSchemasVal),
    [activeSchemasVal]
  );

  const [selectedField, setSelectedField] = useState(activeFields[0]);

  const availableClasses = useMemo(
    () =>
      selectedField
        ? activeSchemasVal[selectedField]?.config?.classes || []
        : [],
    [activeSchemasVal, selectedField]
  );

  const handleComplete = useCallback(() => {
    const trimmedLabelName = labelName.trim();

    if (!trimmedLabelName || !selectedField) {
      return;
    }

    if (
      availableClasses.length > 0 &&
      !availableClasses.includes(trimmedLabelName)
    ) {
      return;
    }

    // All validations passed, complete the action
    onComplete({
      labelName: trimmedLabelName,
      field: selectedField,
    });
  }, [labelName, selectedField, availableClasses, onComplete]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleComplete();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        opacity: 0.95,
        backgroundColor: "#000000",
        top: payload.y,
        left: payload.x,
        zIndex: 99999,
        border: "1px solid #333",
        borderRadius: "4px",
        padding: "16px",
        minWidth: "200px",
      }}
    >
      <Stack spacing={1}>
        {activeFields.length === 1 ? (
          <TextField value={activeFields[0]} size="small" disabled fullWidth />
        ) : (
          <Autocomplete
            options={activeFields}
            value={selectedField}
            onChange={(_, newValue) => newValue && setSelectedField(newValue)}
            renderInput={(params) => <TextField {...params} label={"field"} />}
          />
        )}

        <Autocomplete
          autoFocus
          autoComplete
          autoHighlight
          autoSelect
          openOnFocus
          options={availableClasses}
          value={labelName}
          onInputChange={(_, newValue) => setLabelName(newValue)}
          renderInput={(params) => (
            <TextField
              autoFocus
              {...params}
              ref={labelInputRef}
              placeholder="Label name"
              size="small"
              onKeyDown={handleKeyDown}
              fullWidth
            />
          )}
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button
            onClick={onDismiss}
            size="small"
            sx={{ color: "#888", minWidth: "auto", px: 1 }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleComplete}
            variant="contained"
            size="small"
            disabled={
              !labelName.trim() ||
              !selectedField ||
              (availableClasses.length > 0 &&
                !availableClasses.includes(labelName.trim()))
            }
            sx={{
              backgroundColor: "#333",
              color: "white",
              minWidth: "auto",
              px: 1,
              "&:hover": { backgroundColor: "#444" },
              "&:disabled": { backgroundColor: "#222", color: "#666" },
            }}
          >
            Done
          </Button>
        </Stack>
      </Stack>
    </div>
  );
};

export const InteractiveModelInput = () => {
  const [interactiveModeInputVal, setInteractiveModeInputVal] =
    useAtom(interactiveModeInput);

  if (interactiveModeInputVal?.inputType === "new-bounding-box") {
    return (
      <NewBoundingBox
        payload={interactiveModeInputVal.payload}
        onDismiss={() => setInteractiveModeInputVal(null)}
        onComplete={(value) => {
          interactiveModeInputVal.onComplete(value);
          setInteractiveModeInputVal(null);
        }}
      />
    );
  }

  return null;
};
