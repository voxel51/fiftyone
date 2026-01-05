import { NumberKeyObjectType } from "@fiftyone/utilities";
import { Add, Delete } from "@mui/icons-material";
import { Avatar, Box, Grid, IconButton } from "@mui/material";
import { cloneDeep, set, throttle } from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { getComponentProps, getEmptyValue } from "../utils";
import { ViewPropsType } from "../utils/types";
import Accordion from "./Accordion";
import Button from "./Button";
import DynamicIO from "./DynamicIO";
import EmptyState from "./EmptyState";
import HeaderView from "./HeaderView";

export default function ListView(props: ViewPropsType) {
  const { schema, onChange, path, data, errors } = props;
  const { state, addItem, deleteItem, updateItem, size } = useListState(
    data ?? schema.default ?? DEFAULT_LIST_STATE,
    path,
    onChange
  );

  const { items, view = {} } = schema;
  const { items: itemsView = {}, collapsible, readOnly } = view;
  const itemsSchema = {
    ...items,
    view: { ...(items?.view || {}), ...itemsView },
  };
  const label = view.label;
  const lowerCaseLabel = label?.toLowerCase();

  return (
    <Box {...getComponentProps(props, "container")}>
      <HeaderView
        {...props}
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
        nested
      />
      <Grid container rowSpacing={1} sx={{ ml: 1 }}>
        {size === 0 && (
          <Grid item xs={12}>
            <EmptyState label={lowerCaseLabel} />
          </Grid>
        )}
        {Object.keys(state).map((id, index) => {
          const fullPath = `${path}.${index}`;
          const subPath = id.toString();
          const value = state[id];
          const ItemComponent = collapsible
            ? CollapsibleListItem
            : NonCollapsibleListItem;

          return (
            <ItemComponent
              {...props}
              key={`${path}.${id}`}
              id={id}
              path={fullPath}
              index={index}
              data={value}
              onChange={(path: string, value: unknown) => {
                const relativePath = subPath + path.replace(fullPath, "");
                updateItem(relativePath, value);
              }}
              onDelete={deleteItem}
              errors={errors}
              schema={itemsSchema}
              readOnly={readOnly}
              hideIndexLabel={schema?.view?.hideIndexLabel}
              parentSchema={schema}
              relativePath={id}
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
      {...getComponentProps(props, "accordion")}
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
          <Avatar
            sx={{ width: 24, height: 24, mr: 1, fontSize: "1rem" }}
            {...getComponentProps(props, "index")}
          >
            {index}
          </Avatar>
        </Grid>
      )}
      <Grid item xs>
        <DynamicIO {...props} />
      </Grid>
      {!readOnly && (
        <Grid item>
          <DeleteButton {...props} {...getComponentProps(props, "delete")} />
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

function useListState(
  initialState: Array<unknown>,
  path: ViewPropsType["path"],
  onChange: ViewPropsType["onChange"]
) {
  const nextIdRef = useRef(0);

  const [state, setState] = useState<NumberKeyObjectType>(() => {
    const initialStateById: NumberKeyObjectType = {};
    for (const item of initialState) {
      initialStateById[nextIdRef.current++] = item;
    }
    return initialStateById;
  });
  const onListChange = useMemo(() => {
    const throttledOnChange = throttle(
      (updatedState: NumberKeyObjectType) => {
        onChange(path, Object.values(updatedState));
      },
      LIST_CHANGE_THROTTLE,
      { leading: false, trailing: true }
    );
    return throttledOnChange;
  }, [onChange, path]);

  useEffect(() => {
    return () => {
      onListChange.cancel();
    };
  }, [onListChange]);

  function addItem(item: unknown) {
    setState((state) => {
      const updatedState = { ...state, [nextIdRef.current]: item };
      onListChange(updatedState);
      return updatedState;
    });
    nextIdRef.current++;
  }

  function deleteItem(id: number) {
    setState((state) => {
      const updatedState = { ...state };
      delete updatedState[id];
      onListChange(updatedState);
      return updatedState;
    });
  }
  function updateItem(path: string, value: unknown) {
    setState((state) => {
      const updatedState = cloneDeep(state);
      set(updatedState, path, value);
      onListChange(updatedState);
      return updatedState;
    });
  }
  const size = Object.keys(state).length;

  return { size, state, addItem, deleteItem, updateItem };
}

const LIST_CHANGE_THROTTLE = 100; // ms
const DEFAULT_LIST_STATE = [] as Array<unknown>;
