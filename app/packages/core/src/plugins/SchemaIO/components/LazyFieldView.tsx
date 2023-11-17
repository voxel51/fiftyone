import { Replay, Save } from "@mui/icons-material";
import { Box, IconButton, Stack } from "@mui/material";
import { merge } from "lodash";
import React, { useCallback, useState } from "react";
import FieldView from "./FieldView";

export default function LazyFieldView(props) {
  const { onChange, path, schema } = props;
  const [value, setValue] = useState(schema?.default || "");
  const [state, setState] = useState(value);
  const saveOnBlur = schema?.view?.save_on_blur;

  const applyChanges = useCallback(() => {
    setValue(state);
    onChange(path, state);
  }, [onChange, path, setValue, state]);

  const schemaOverrides = {
    view: {
      componentsProps: {
        field: {
          value: state,
          InputProps: {
            endAdornment: (
              <ApplyReset
                key={state}
                hasChanges={value !== state}
                onApply={applyChanges}
                onReset={() => {
                  setState(value);
                }}
              />
            ),
          },
          onBlur: saveOnBlur ? applyChanges : undefined,
        },
      },
    },
  };
  const computedSchema = merge(schema, schemaOverrides);

  return (
    <FieldView
      {...props}
      schema={computedSchema}
      onChange={(_: string, value: string) => {
        setState(value);
      }}
    />
  );
}

function ApplyReset(props: ApplyResetPropsType) {
  const { hasChanges, onApply, onReset } = props;
  return (
    <Stack direction="row">
      {hasChanges && (
        <IconButton
          title="Reset changes"
          size="small"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={onReset}
        >
          <Replay color="secondary" fontSize="small" />
        </IconButton>
      )}
      <Box
        title={hasChanges ? "Apply changes" : "No pending changes"}
        sx={{ cursor: hasChanges ? undefined : "default" }}
      >
        <IconButton size="small" onClick={onApply} disabled={!hasChanges}>
          <Save
            sx={{
              color: (theme) =>
                theme.palette.text[hasChanges ? "primary" : "tertiary"],
            }}
            fontSize="small"
          />
        </IconButton>
      </Box>
    </Stack>
  );
}

type ApplyResetPropsType = {
  hasChanges: boolean;
  onApply: () => void;
  onReset: () => void;
};
