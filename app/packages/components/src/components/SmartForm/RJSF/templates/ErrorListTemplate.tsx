/**
 * Custom ErrorListTemplate to avoid icon import issues
 */

import React from "react";
import { ErrorListProps, FormContextType, RJSFSchema, StrictRJSFSchema, TranslatableString } from "@rjsf/utils";
import { Box, List, ListItem, ListItemText, Paper, Typography } from "@mui/material";

export default function ErrorListTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any
>({ errors, registry }: ErrorListProps<T, S, F>) {
  const { translateString } = registry;
  return (
    <Paper elevation={2}>
      <Box mb={2} p={2}>
        <Typography variant="h6">
          {translateString(TranslatableString.ErrorsLabel)}
        </Typography>
        <List dense={true}>
          {errors.map((error, i: number) => {
            return (
              <ListItem key={i}>
                <ListItemText
                  primary={error.stack}
                  sx={{ color: "error.main" }}
                />
              </ListItem>
            );
          })}
        </List>
      </Box>
    </Paper>
  );
}
