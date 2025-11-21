# SchemaIOComponent Usage Examples

This document contains real-world usage examples of `SchemaIOComponent` found in the FiftyOne codebase.

## Table of Contents
- [Basic Usage](#basic-usage)
- [Real-World Examples](#real-world-examples)
- [Field Types](#field-types)
- [Complex Schemas](#complex-schemas)

---

## Basic Usage

```tsx
import { SchemaIOComponent, type SchemaIOComponentProps } from "@fiftyone/core/plugins/SchemaIO";

const props: SchemaIOComponentProps = {
  schema: mySchema,
  data: initialData,
  onChange: (data) => console.log(data),
};

<SchemaIOComponent {...props} />
```

---

## Real-World Examples

### 1. Field Selection Dropdown
**Source**: `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/Field.tsx`

Creates a dropdown for selecting annotation fields:

```tsx
const schema = {
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    field: {
      type: "string",
      view: {
        name: "DropdownView",
        label: "field",
        placeholder: "Select a field",
        component: "DropdownView",
        choices: [
          { name: "Choice", label: "Field 1", value: "field1" },
          { name: "Choice", label: "Field 2", value: "field2" },
        ],
      },
    },
  },
};

<SchemaIOComponent
  schema={schema}
  data={{ field: "field1" }}
  onChange={({ field }) => setCurrentField(field)}
/>
```

---

### 2. Read-Only ID Display
**Source**: `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/Id.tsx`

Displays a read-only ID field:

```tsx
const schema = {
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    id: {
      type: "string",
      view: {
        name: "PrimitiveView",
        readOnly: true,
        component: "PrimitiveView",
      },
    },
  },
};

<SchemaIOComponent
  schema={schema}
  data={{ id: overlay?.id }}
/>
```

---

### 3. Annotation Schema with Multiple Field Types
**Source**: `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/AnnotationSchema.tsx`

Complex schema with various field types:

```tsx
const schema = {
  type: "object",
  view: {
    component: "ObjectView",
  },
  properties: {
    // Dropdown for label selection
    label: {
      type: "string",
      view: {
        name: "DropdownView",
        label: "label",
        component: "DropdownView",
        choices: [
          { name: "Choice", label: "Cat", value: "cat" },
          { name: "Choice", label: "Dog", value: "dog" },
        ],
      },
    },
    // Radio buttons for status
    status: {
      type: "string",
      view: {
        name: "RadioGroup",
        label: "status",
        component: "RadioView",
        choices: [
          { label: "Active", value: "active" },
          { label: "Inactive", value: "inactive" },
        ],
      },
    },
    // Tags with autocomplete
    tags: {
      type: "array",
      view: {
        name: "AutocompleteView",
        label: "tags",
        component: "AutocompleteView",
        allow_user_input: false,
        choices: [
          { name: "Choice", label: "Indoor", value: "indoor" },
          { name: "Choice", label: "Outdoor", value: "outdoor" },
        ],
      },
      required: true,
    },
    // Number input
    confidence: {
      type: "number",
      view: {
        name: "PrimitiveView",
        label: "confidence",
        component: "PrimitiveView",
      },
    },
  },
};

<SchemaIOComponent
  useJSONSchema={true}
  schema={schema}
  data={data}
  onChange={async (changes) => {
    // Handle changes...
  }}
/>
```

---

### 4. Operator IO Wrapper
**Source**: `app/packages/core/src/plugins/OperatorIO/index.tsx`

Wraps SchemaIOComponent for operator input/output:

```tsx
<SchemaIOComponent
  id={id}
  shouldClearUseKeyStores={shouldClearUseKeyStores}
  schema={ioSchema}
  onChange={onChange}
  onPathChange={onPathChange}
  data={data}
  errors={getErrorsByPath(errors)}
  initialData={initialData}
  layout={layout}
  otherProps={otherProps}
/>
```

---

### 5. Development Panel with Multiple Schemas
**Source**: `app/packages/core/src/plugins/OperatorIO/examples/Panel.tsx`

Testing panel with schema switching:

```tsx
{mode === "input" && (
  <SchemaIOComponent
    schema={ioSchema}
    onChange={log}
    errors={inputErrors}
  />
)}
{mode === "output" && (
  <SchemaIOComponent
    schema={oSchema}
    onChange={log}
    data={state}
  />
)}
```

---

## Field Types

### String Input
```tsx
{
  type: "string",
  view: {
    name: "PrimitiveView",
    label: "Name",
    component: "PrimitiveView",
  },
}
```

### Number Input
```tsx
{
  type: "number",
  view: {
    label: "Age",
    component: "PrimitiveView",
  },
}
```

### Boolean (Checkbox)
```tsx
{
  type: "boolean",
  view: {
    label: "Active",
    component: "CheckboxView",
  },
}
```

### Dropdown
```tsx
{
  type: "string",
  view: {
    name: "DropdownView",
    label: "Category",
    component: "DropdownView",
    choices: [
      { name: "Choice", label: "Option 1", value: "opt1" },
      { name: "Choice", label: "Option 2", value: "opt2" },
    ],
  },
}
```

### Radio Buttons
```tsx
{
  type: "string",
  view: {
    name: "RadioGroup",
    label: "Status",
    component: "RadioView",
    choices: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
}
```

### Autocomplete (Single)
```tsx
{
  type: "string",
  view: {
    name: "AutocompleteView",
    label: "Select Tag",
    component: "AutocompleteView",
    allow_user_input: true,
    choices: [
      { name: "Choice", label: "Tag 1", value: "tag1" },
      { name: "Choice", label: "Tag 2", value: "tag2" },
    ],
  },
}
```

### Autocomplete (Multiple/Tags)
```tsx
{
  type: "array",
  view: {
    name: "AutocompleteView",
    label: "Tags",
    component: "AutocompleteView",
    allow_user_input: false,
    allow_duplicates: false,
    choices: [
      { name: "Choice", label: "Tag 1", value: "tag1" },
      { name: "Choice", label: "Tag 2", value: "tag2" },
    ],
  },
}
```

### Color Picker
```tsx
{
  type: "string",
  view: {
    label: "Color",
    name: "ColorView",
    component: "ColorView",
  },
}
```

### Code Editor
```tsx
{
  type: "string",
  view: {
    label: "Code",
    name: "CodeView",
    component: "CodeView",
    language: "javascript",
  },
}
```

### File Upload
```tsx
{
  type: "string",
  view: {
    label: "File",
    name: "FileView",
    component: "FileView",
  },
}
```

### Array/List
```tsx
{
  type: "array",
  items: {
    type: "string",
    view: {},
  },
  view: {
    label: "List Field",
    component: "ListView",
  },
}
```

### Map (Key-Value)
```tsx
{
  type: "object",
  additionalProperties: {
    type: "string",
    view: {},
  },
  view: {
    name: "MapView",
    label: "Map Field",
  },
}
```

---

## Complex Schemas

### Nested Objects
```tsx
{
  type: "object",
  view: { component: "ObjectView" },
  properties: {
    person: {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        name: {
          type: "string",
          view: { label: "Name" },
        },
        age: {
          type: "number",
          view: { label: "Age" },
        },
      },
    },
    address: {
      type: "object",
      view: { component: "ObjectView" },
      properties: {
        street: {
          type: "string",
          view: { label: "Street" },
        },
        city: {
          type: "string",
          view: { label: "City" },
        },
      },
    },
  },
}
```

### Array of Objects
```tsx
{
  type: "array",
  items: {
    type: "object",
    view: { component: "ObjectView" },
    properties: {
      name: {
        type: "string",
        view: { label: "Name" },
      },
      value: {
        type: "number",
        view: { label: "Value" },
      },
    },
  },
  view: { component: "ListView" },
}
```

---

## RJSF Mode (useJSONSchema)

When using `useJSONSchema={true}`, you can pass additional RJSF-specific props:

```tsx
<SchemaIOComponent
  useJSONSchema={true}
  schema={schema}
  data={data}
  uiSchema={{
    name: {
      "ui:placeholder": "Enter name",
      "ui:help": "Your display name",
    },
  }}
  onChange={(data) => console.log(data)}
  onSubmit={(data) => console.log("Submitted:", data)}
  validator={customValidator}
/>
```

---

## Type Safety

All props are fully typed:

```tsx
import type { SchemaIOComponentProps } from "@fiftyone/core/plugins/SchemaIO";

const props: SchemaIOComponentProps = {
  schema: mySchema,        // SchemaType | RJSFSchema
  data: initialData,       // unknown
  useJSONSchema: true,     // boolean
  onChange: (data) => {},  // (data: unknown, liteValues?: Record<string, unknown>) => void
  onSubmit: (data) => {},  // (data: unknown) => void (RJSF only)
};
```

---

## Schema Detection

The component automatically detects whether a schema is SchemaIO or JSON Schema format:

```tsx
// SchemaIO format (has `view` property)
const schemaIOSchema = {
  type: "string",
  view: { component: "FieldView" },
};

// JSON Schema format (no `view` property)
const jsonSchema = {
  type: "string",
  title: "Name",
  description: "User name",
};

// Automatically uses correct renderer
<SchemaIOComponent schema={schemaIOSchema} />  // Uses SchemaIO renderer
<SchemaIOComponent schema={jsonSchema} />      // Uses SmartForm (RJSF) renderer

// Or force RJSF renderer
<SchemaIOComponent schema={schemaIOSchema} useJSONSchema={true} />
```
