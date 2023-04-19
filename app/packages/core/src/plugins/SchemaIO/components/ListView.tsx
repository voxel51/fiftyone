import React, { useEffect, useState } from "react";
import { Box, Grid, IconButton } from "@mui/material";
import { Add, Delete } from "@mui/icons-material";
import Header from "./Header";
import Button from "./Button";
import EmptyState from "./EmptyState";
import DynamicIO from "./DynamicIO";

export default function ListView(props) {
  const { schema, onChange, path, data, errors } = props;
  const [state, setState] = useState<string[]>(data ?? (schema.default || []));
  const { items, view } = schema;
  const { items: itemsView = {} } = view;

  const itemsSchema = {
    ...items,
    view: { ...(items?.view || {}), ...itemsView },
  };

  const label = view.label;
  const lowerCaseLabel = label.toLowerCase();

  useEffect(() => {
    onChange(path, state);
  }, [state]);

  return (
    <Box>
      <Header
        {...view}
        divider
        Actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => {
              setState((state) => [...state, ""]);
            }}
          >
            Add {lowerCaseLabel}
          </Button>
        }
      />
      <Grid container rowSpacing={1} columnSpacing={2} sx={{ px: 1 }}>
        {state.length === 0 && (
          <Grid item xs={12}>
            <EmptyState label={lowerCaseLabel} />
          </Grid>
        )}
        {state.map((item, i) => (
          <Grid
            container
            item
            xs={12}
            key={`${path}.${i}`}
            spacing={0.25}
            sx={{ alignItems: "flex-start" }}
          >
            <Grid item xs>
              <DynamicIO
                schema={itemsSchema}
                onChange={(path, value) => {
                  setState((state) => {
                    const updatedState = [...state];
                    updatedState[path] = value;
                    return updatedState;
                  });
                }}
                path={i.toString()}
                data={data?.[i]}
                errors={errors}
              />
            </Grid>
            <Grid item>
              <IconButton
                onClick={() => {
                  setState((state) => {
                    const updatedState = [...state];
                    updatedState.splice(i, 1);
                    return updatedState;
                  });
                }}
              >
                <Delete color="error" />
              </IconButton>
            </Grid>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
