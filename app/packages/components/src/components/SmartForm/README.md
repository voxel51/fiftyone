# SmartForm

A React JSON Schema Form (RJSF) wrapper that automatically translates SchemaIO
schemas to JSON Schema format.

## Features

✅ **Automatic Translation** - Converts SchemaIO schemas to JSON Schema + UI
Schema ✅ **Bidirectional Data Conversion** - Handles SchemaIO ↔ RJSF data
formats ✅ **Custom Widgets** - Reuses existing SchemaIO components (Dropdown,
AutoComplete) ✅ **Type Safe** - Full TypeScript support with exported types ✅
**Material-UI Styled** - Built on @rjsf/mui for consistent design ✅
**Extensible** - Override generated UI schema for fine control

---

## Quick Start

```tsx
import SmartForm from "@fiftyone/components/SmartForm";

const schema = {
    type: "object",
    view: { component: "ObjectView" },
    properties: {
        name: {
            type: "string",
            view: { label: "Name", placeholder: "Enter name" },
        },
        email: {
            type: "string",
            view: { label: "Email" },
            required: true,
        },
    },
};

<SmartForm
    schema={schema}
    data={{ name: "John Doe" }}
    onChange={(data) => console.log(data)}
/>;
```

---

## Installation

SmartForm is part of the `@fiftyone/components` package:

```bash
yarn add @fiftyone/components
```

**Dependencies:**

-   `@rjsf/core` - React JSON Schema Form core
-   `@rjsf/mui` - Material-UI theme
-   `@rjsf/validator-ajv8` - JSON Schema validation
-   `@rjsf/utils` - RJSF utilities

---

## Basic Example

```tsx
import SmartForm, {
    type SmartFormProps,
} from "@fiftyone/components/SmartForm";

function MyForm() {
    const schema = {
        type: "object",
        properties: {
            category: {
                type: "string",
                view: {
                    component: "DropdownView",
                    label: "Category",
                    choices: [
                        { value: "cat", label: "Cat" },
                        { value: "dog", label: "Dog" },
                    ],
                },
            },
        },
    };

    return (
        <SmartForm
            schema={schema}
            onChange={(data) => console.log("Changed:", data)}
            onSubmit={(data) => console.log("Submitted:", data)}
        />
    );
}
```

---

## Props

```tsx
interface SmartFormProps {
    schema?: SchemaType; // SchemaIO schema
    jsonSchema?: RJSFSchema; // JSON Schema (alternative to schema)
    data?: unknown; // Initial form data
    uiSchema?: UiSchema; // Override generated UI schema
    validator?: ValidatorType; // Custom JSON Schema validator (optional)
    onChange?: (data: unknown) => void; // Change handler
    onSubmit?: (data: unknown) => void; // Submit handler
}
```

### Prop Details

- **`schema`**: SchemaIO format schema. Either `schema` or `jsonSchema` is required.
- **`jsonSchema`**: JSON Schema format. Either `schema` or `jsonSchema` is required.
- **`data`**: Initial form data to populate the form fields.
- **`uiSchema`**: Custom UI Schema to override auto-generated UI configurations.
- **`validator`**: Custom validator for JSON Schema validation. Defaults to `@rjsf/validator-ajv8` if not provided.
- **`onChange`**: Callback fired when form data changes. Receives updated data.
- **`onSubmit`**: Callback fired when form is submitted. Receives final data.

---

## How It Works

SmartForm performs three main operations:

### 1. Schema Translation

```tsx
// Input: SchemaIO format
{
  type: "string",
  view: {
    component: "DropdownView",
    choices: [
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" }
    ]
  }
}

// Output: JSON Schema + UI Schema
{
  schema: {
    type: "string",
    enum: ["a", "b"],
    enumNames: ["Option A", "Option B"]
  },
  uiSchema: {
    "ui:widget": "Dropdown"
  }
}
```

### 2. Data Conversion (Input)

```tsx
// SchemaIO format: null for empty
{ name: "John", age: null }

// Converted to RJSF format: appropriate empty values
{ name: "John", age: undefined }
```

### 3. Data Conversion (Output)

```tsx
// RJSF format from onChange
{ name: "John", age: undefined }

// Converted back to SchemaIO format
{ name: "John", age: null }
```

---

## Supported Field Types

| SchemaIO Component | RJSF Widget    | Description                  |
| ------------------ | -------------- | ---------------------------- |
| `FieldView`        | `TextWidget`   | Text input                   |
| `CheckboxView`     | `checkbox`     | Checkbox                     |
| `DropdownView`     | `Dropdown`     | Single/multi select dropdown |
| `RadioView`        | `radio`        | Radio buttons                |
| `AutocompleteView` | `AutoComplete` | Searchable autocomplete      |
| `ColorView`        | `color`        | Color picker                 |
| `CodeView`         | `textarea`     | Code/text area               |
| `FileView`         | `file`         | File upload                  |
| `ObjectView`       | (fieldset)     | Nested object                |
| `ListView`         | (array)        | Dynamic list                 |
| `TupleView`        | (array)        | Fixed tuple                  |

---

## Advanced Usage

### Custom UI Schema

```tsx
const uiSchema = {
    name: {
        "ui:placeholder": "John Doe",
        "ui:help": "Your display name",
    },
    email: {
        "ui:widget": "email",
    },
};

<SmartForm
    schema={schema}
    uiSchema={uiSchema} // Overrides generated UI schema
/>;
```

### Validation

SmartForm supports both live validation (as users type) and submit-time validation.

#### Live Validation (Default)

By default, SmartForm validates fields in real-time as users interact with the form:

```tsx
<SmartForm
    schema={schema}
    data={data}
/>
```

#### Custom Validator

Provide a custom validator with specific configuration:

```tsx
import { customizeValidator } from "@rjsf/validator-ajv8";

const customValidator = customizeValidator({
    ajvOptionsOverrides: {
        allErrors: true,
        verbose: true,
    },
});

<SmartForm
    schema={schema}
    validator={customValidator}
/>;
```

#### Validation Example

```tsx
const schema = {
    type: "object",
    properties: {
        email: {
            type: "string",
            view: { label: "Email" },
            pattern: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
        },
        age: {
            type: "number",
            view: { label: "Age" },
            min: 18,
            max: 100,
        },
    },
};

<SmartForm
    schema={schema}
    onChange={(data) => console.log(data)}
/>;
```

### Type Safety

```tsx
import type { SmartFormProps } from "@fiftyone/components/SmartForm";

const props: SmartFormProps = {
    schema: mySchema,
    data: initialData,
    onChange: (data) => {
        // data is typed as unknown
        // Validate or assert type as needed
    },
};
```

---

## Translation API

SmartForm exports translation functions for advanced use cases:

```tsx
import {
    translateSchemaComplete,
    translateSchema,
    isSchemaIOSchema,
    isJSONSchema,
} from "@fiftyone/components/SmartForm/translators";

// Full translation with data
const result = translateSchemaComplete(schema, data);
console.log(result.schema); // JSON Schema
console.log(result.uiSchema); // UI Schema
console.log(result.formData); // Converted data
console.log(result.warnings); // Translation warnings

// Schema only
const { schema, uiSchema, warnings } = translateSchema(schemaIO);

// Type guards
if (isSchemaIOSchema(someSchema)) {
    // someSchema is SchemaType
}
```

---

## Custom Widgets

SmartForm includes custom widgets that wrap SchemaIO components:

### AutoComplete Widget

```tsx
// Automatically used for AutocompleteView
{
  type: "array",
  view: {
    component: "AutocompleteView",
    choices: [...],
    allow_user_input: true,
    allow_duplicates: false,
  }
}
```

### Dropdown Widget

```tsx
// Automatically used for DropdownView
{
  type: "string",
  view: {
    component: "DropdownView",
    choices: [...],
    multiple: true,
  }
}
```

---

## Architecture

```
SmartForm/
├── index.tsx              # Main component
├── translators/           # Schema translation
│   ├── index.ts          # Main API
│   ├── schema.ts         # JSON Schema translation
│   ├── ui.ts             # UI Schema translation
│   ├── data.ts           # Data conversion
│   └── utils.ts          # Shared utilities
├── widgets/               # Custom RJSF widgets
│   ├── AutoComplete.tsx
│   ├── Dropdown.tsx
│   └── TextWidget.tsx
├── templates/             # Custom RJSF templates
│   ├── FieldTemplate.tsx
│   └── ObjectFieldTemplate.tsx
└── __tests__/             # Comprehensive tests
```

---

## Testing

SmartForm has comprehensive test coverage:

```bash
# Run all tests
yarn test SmartForm

# Run specific test suites
yarn test translators
yarn test schema.test
yarn test ui.test
yarn test data.test
```

**Test Coverage:**

-   ✅ 170+ test cases
-   ✅ All field types
-   ✅ Data conversion (bidirectional)
-   ✅ Edge cases
-   ✅ Integration tests

---

## Integration with SchemaIOComponent

SmartForm can be used directly or through `SchemaIOComponent`:

### Direct Usage

```tsx
import SmartForm from "@fiftyone/components/SmartForm";

<SmartForm schema={schema} data={data} />;
```

### Through SchemaIOComponent (Auto-detection)

```tsx
import { SchemaIOComponent } from "@fiftyone/core/plugins/SchemaIO";

// Automatically uses SmartForm for JSON schemas
<SchemaIOComponent schema={jsonSchema} />

// Force SmartForm for SchemaIO schemas
<SchemaIOComponent schema={schemaIOSchema} useJSONSchema={true} />
```

---

## Migration Guide

### From SchemaIO DynamicIO

**Before:**

```tsx
import { SchemaIOComponent } from "@fiftyone/core/plugins/SchemaIO";

<SchemaIOComponent
    schema={schema}
    data={data}
    onChange={(data, liteValues) => handleChange(data)}
    onPathChange={(path, value) => handlePathChange(path, value)}
/>;
```

**After:**

```tsx
import SmartForm from "@fiftyone/components/SmartForm";

<SmartForm
    schema={schema}
    data={data}
    onChange={(data) => handleChange(data)}
    // Note: onPathChange not supported
    // Use onChange with full data instead
/>;
```

---

## Limitations

1. **Custom Components** - Some SchemaIO components don't have RJSF
   equivalents:

    - `PlotlyView`
    - `DashboardView`
    - `FileExplorerView`
    - `MarkdownView`
    - `ButtonView`
    - `LinkView`
    - `NoticeView`
    - `MenuView`
    - `LazyFieldView`
    - `ProgressView`

    **Workaround:** Use `SchemaIOComponent` without `useJSONSchema` flag.

2. **Path-based Updates** - RJSF doesn't support path-based change handlers
   like SchemaIO's `onPathChange`. Use `onChange` with full data instead.

3. **Lite Values** - RJSF doesn't have an equivalent to SchemaIO's "lite
   values" concept.

---

## Performance

SmartForm is optimized for:

-   ✅ Fast schema translation (cached)
-   ✅ Minimal re-renders
-   ✅ Efficient data conversion
-   ✅ Large forms (100+ fields)

---

## Browser Support

Same as RJSF:

-   Chrome (latest)
-   Firefox (latest)
-   Safari (latest)
-   Edge (latest)

---

## Contributing

When adding new features:

1. Update translators if adding new field types
2. Add tests for new functionality
3. Update this documentation
4. Ensure TypeScript types are correct

---

## Resources

-   [Full Usage Examples](./USAGE_EXAMPLES.md)
-   [Translator Tests](./translators/__tests__/)
-   [RJSF Documentation](https://rjsf-team.github.io/react-jsonschema-form/)
-   [JSON Schema Specification](https://json-schema.org/)

---

## License

Apache-2.0

---

## Support

For issues or questions:

-   GitHub: [voxel51/fiftyone](https://github.com/voxel51/fiftyone)
-   Documentation: [docs.voxel51.com](https://docs.voxel51.com)
