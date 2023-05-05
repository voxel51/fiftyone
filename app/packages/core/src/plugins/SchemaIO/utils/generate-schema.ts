// Auto generate SchemaIO compatible schema based on a value
// todo: add support for OneOfView, TupleView, and MapView
export function generateSchema(value, options?) {
  const type = getType(value);
  const { label, readOnly } = options;
  if (type === "array") {
    const dominantType = getDominantType(value);
    const isValueTable = isTable(value);
    if (isValueTable && readOnly) {
      return {
        type,
        view: {
          label,
          component: "TableView",
          columns: getTableColumns(value),
          readOnly: true,
        },
      };
    } else if (primitives.includes(dominantType) && readOnly) {
      return {
        type,
        view: {
          label,
          component: "TagsView",
        },
      };
    } else {
      // todo: support mixed items types? with tuple?
      const [firstItemKey] = Object.keys(value);
      return {
        type,
        items: generateSchema(value[firstItemKey], { readOnly }),
        view: {
          label,
          component: "ListView",
          readOnly,
        },
      };
    }
  } else if (type === "object") {
    return {
      type,
      properties: Object.keys(value).reduce((obj, key) => {
        obj[key] = generateSchema(value[key], { label: key, readOnly });
        return obj;
      }, {}),
      view: {
        label,
        component: "ObjectView",
        readOnly,
      },
    };
  } else {
    return {
      type,
      view: {
        label,
        component: readOnly
          ? "LabelValueView"
          : type === "boolean"
          ? "CheckboxView"
          : "FieldView",
        readOnly,
      },
    };
  }
}

function getType(value) {
  if (value !== undefined || value !== null)
    return Array.isArray(value) ? "array" : typeof value;
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

function getTableColumns(array) {
  const [firstItem] = array;
  return Object.keys(firstItem).map((key) => ({ key, label: key }));
}

const primitives = ["string", "number", "boolean"];
