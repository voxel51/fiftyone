import { Box, Stack, Typography } from "@mui/material";
import React from "react";
import Header from "./Header";
import KeyValueView from "./KeyValueView";
import TagsView from "./TagsView";
import TableView from "./TableView";

// todo: ...
export default function InferredView(props) {
  const { label, data, ...otherProps } = props;
  const Component = getComponent(data);
  return <Component label={label} data={data} {...otherProps} />;
}

function PrimitiveView(props) {
  const { label, data } = props;
  return (
    <Stack direction="row" spacing={1}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography>{data.toString()}</Typography>
    </Stack>
  );
}

function ObjectView(props) {
  const { label, data, nested } = props;
  if (!data) return null;
  const properties = Object.keys(data);

  const keyValue = properties.map((key) => {
    const value = data[key];
    const type = getType(value);
    const prop = {
      id: key,
      label: key,
    };
    if (type === "array")
      prop.Component = <ArrayView label={key} data={value} nested />;
    else if (type === "object")
      prop.Component = <ObjectView label={key} data={value} nested />;
    else prop.value = value;
    return prop;
  });

  return (
    <Box>
      {!nested && <Header label={label} />}
      <KeyValueView schema={{}} data={keyValue} nested={nested} />
    </Box>
  );
}

function ArrayView(props) {
  const { label, data, nested } = props;

  // todo: ...
  if (data?.length === 0) return null;

  const type = getDominantType(data);

  if (primitives.includes(type)) {
    const formattedData = data.map((value) => ({
      id: value.toString(),
      label: value.toString(),
    }));
    return (
      <TagsView
        data={formattedData}
        schema={nested ? {} : { view: { label } }}
      />
    );
  }

  const tableView = isTable(data);
  if (tableView) {
    const columns = Object.keys(data[0]).map((key) => ({ key, label: key }));
    return (
      <TableView
        schema={{ view: { columns, label: !nested && label } }}
        data={data}
      />
    );
  }

  const keyValueData = data.map((item, i) => ({
    id: i,
    label: i,
    Component: <InferredView key={label} data={item} nested={true} />,
  }));
  return (
    <KeyValueView
      schema={{ view: nested ? {} : { label } }}
      data={keyValueData}
      nested={nested}
    />
  );
}

const primitives = ["string", "number", "boolean"];
const typeToComponent = {
  array: ArrayView,
  object: ObjectView,
  string: PrimitiveView,
  number: PrimitiveView,
  boolean: PrimitiveView,
};

function getType(value) {
  let type = typeof value;
  if (typeof value === "object") {
    type = Array.isArray(value) ? "array" : "object";
  }
  return type;
}

function getComponent(data) {
  const dataType = getType(data);
  return typeToComponent[dataType];
}

function getDominantType(array) {
  const typesCount = {};
  for (const item of array) {
    const itemType = getType(item);
    typesCount[itemType] = typesCount[itemType] + 1 || 1;
  }
  let dominantType;
  let dominantTypeCount;
  for (const type in typesCount) {
    const count = typesCount[type];
    if (!dominantType) {
      dominantType = type;
      dominantTypeCount = count;
    } else if (count > dominantTypeCount) {
      dominantType = type;
      dominantTypeCount = count;
    } else if (count === dominantTypeCount && primitives.includes(type)) {
      dominantType = type;
    }
  }
  return dominantType;
}

function isTable(array) {
  let serializedKeys;
  for (const item of array) {
    if (getType(item) !== "object") {
      return false;
    }
    const serializedItemKeys = Object.keys(item).join(",");
    if (!serializedKeys) {
      serializedKeys = serializedItemKeys;
      continue;
    }
    if (serializedKeys !== serializedItemKeys) {
      return false;
    }
  }
  return true;
}
