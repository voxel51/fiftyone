import { Add, Delete } from "@mui/icons-material";
import { Avatar, Box, Grid, IconButton } from "@mui/material";
import { set } from "lodash";
import React, { useEffect, useState } from "react";
import Accordion from "./Accordion";
import Button from "./Button";
import DynamicIO from "./DynamicIO";
import EmptyState from "./EmptyState";
import Header from "./Header";
import { getEmptyValue } from "../utils";

export default function ListView(props) {
  const { schema, onChange, path, data, errors } = props;
  const { actualState, state, addItem, deleteItem, updateItem, size } =
    useListState(data ?? schema.default ?? []);

  useEffect(() => {
    onChange(path, actualState);
  }, [state]);

  const { items, view = {} } = schema;
  const { items: itemsView = {}, collapsible, readOnly } = view;
  const itemsSchema = {
    ...items,
    view: { ...(items?.view || {}), ...itemsView },
  };
  const label = view.label;
  const lowerCaseLabel = label.toLowerCase();

  return (
    <Box>
      <Header
        {...view}
        divider
        Actions={
          !readOnly && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => addItem(getEmptyValue(schema))}
            >
              Add {lowerCaseLabel}
            </Button>
          )
        }
      />
      <Grid container rowSpacing={1} sx={{ ml: 1 }}>
        {size === 0 && (
          <Grid item xs={12}>
            <EmptyState label={lowerCaseLabel} />
          </Grid>
        )}
        {Object.keys(state).map((id, index) => {
          const value = state[id];
          const ItemComponent = collapsible
            ? CollapsibleListItem
            : NonCollapsibleListItem;

          return (
            <ItemComponent
              key={`${path}.${id}`}
              id={id}
              path={id.toString()}
              index={index}
              data={value}
              onChange={updateItem}
              onDelete={deleteItem}
              errors={errors}
              schema={itemsSchema}
              readOnly={readOnly}
              hideIndexLabel={schema?.view?.hideIndexLabel}
            />
          );
        })}
      </Grid>
    </Box>
  );
}

function CollapsibleListItem(props) {
  const { readOnly } = props;

  return (
    <Accordion
      defaultExpanded
      label="Item of an array"
      Actions={() => {
        if (readOnly) return null;
        return <DeleteButton {...props} />;
      }}
    >
      <DynamicIO {...props} />
    </Accordion>
  );
}

function NonCollapsibleListItem(props) {
  const { index, readOnly, hideIndexLabel } = props;
  return (
    <Grid
      container
      item
      xs={12}
      spacing={0.25}
      sx={{
        alignItems: "flex-start",
        marginTop: 1.5,
        borderTop: (theme) => `1px solid ${theme.palette.divider}`,
        "&:first-child": {
          border: "none",
          marginTop: 0,
        },
      }}
    >
      {!hideIndexLabel && (
        <Grid item>
          <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: "1rem" }}>
            {index}
          </Avatar>
        </Grid>
      )}
      <Grid item xs>
        <DynamicIO {...props} />
      </Grid>
      {!readOnly && (
        <Grid item>
          <DeleteButton {...props} />
        </Grid>
      )}
    </Grid>
  );
}

function DeleteButton(props) {
  const { onDelete, id } = props;
  return (
    <IconButton
      onClick={(e) => {
        e.stopPropagation();
        onDelete(id);
      }}
      sx={{ p: 0 }}
    >
      <Delete color="error" />
    </IconButton>
  );
}

function useListState(initialState: Array<unknown>) {
  let initialNextId = 0;
  const initialStateById = initialState.reduce((stateById, item) => {
    stateById[initialNextId++] = item;
  }, {});

  const [state, setState] = useState(initialStateById);
  const [nextId, setNextId] = useState(initialNextId);

  function addItem(item) {
    setState((state) => ({ ...state, [nextId]: item }));
    setNextId((nextId) => nextId + 1);
  }

  function deleteItem(id) {
    setState((state) => {
      const updatedState = { ...state };
      delete updatedState[id];
      return updatedState;
    });
  }
  function updateItem(path, value) {
    setState((state) => {
      const updatedState = { ...state };
      set(updatedState, path, value);
      return updatedState;
    });
  }
  const size = Object.keys(state).length;
  const actualState = Object.values(state);

  return { actualState, size, state, addItem, deleteItem, updateItem };
}
