# SmartForm Usage Examples

SmartForm is a React JSON Schema Form (RJSF) wrapper that automatically
translates SchemaIO schemas to JSON Schema format, providing a consistent form
rendering experience.

## Table of Contents

-   [Basic Usage](#basic-usage)
-   [Core Concepts](#core-concepts)
-   [Field Types](#field-types)
-   [Advanced Features](#advanced-features)
-   [Translation API](#translation-api)
-   [Custom Widgets](#custom-widgets)
-   [Type Safety](#type-safety)

---

## Basic Usage

### Simple Form

```tsx
import SmartForm, {
    type SmartFormProps,
} from "@fiftyone/components/SmartForm";

const schema = {
    type: "object",
    view: { component: "ObjectView" },
    properties: {
        name: {
            type: "string",
            view: {
                label: "Name",
                placeholder: "Enter your name",
            },
        },
        age: {
            type: "number",
            view: {
                label: "Age",
                description: "Your age in years",
            },
        },
    },
};

const data = { name: "John Doe", age: 30 };

<SmartForm
    schema={schema}
    data={data}
    onChange={(data) => console.log("Data changed:", data)}
    onSubmit={(data) => console.log("Form submitted:", data)}
/>;
```

---

## Core Concepts

### Automatic Schema Translation

SmartForm automatically translates SchemaIO schemas to JSON Schema + UI Schema:

```tsx
// Input: SchemaIO format
const schemaIO = {
    type: "string",
    view: {
        component: "DropdownView",
        label: "Category",
        choices: [
            { value: "cat", label: "Cat" },
            { value: "dog", label: "Dog" },
        ],
    },
};

// SmartForm automatically translates to:
// JSON Schema: { type: "string", title: "Category", enum: ["cat", "dog"] }
// UI Schema: { "ui:widget": "Dropdown" }

<SmartForm schema={schemaIO} />;
```

### Data Conversion

SmartForm handles bidirectional data conversion:

```tsx
// SchemaIO format: null for empty values
const schemaIOData = { name: "John", age: null };

// Internally converted to RJSF format: undefined for empty numbers
// { name: "John", age: undefined }

// onChange returns data in SchemaIO format
<SmartForm
    schema={schema}
    data={schemaIOData}
    onChange={(data) => {
        // data is back in SchemaIO format: { name: "John", age: null }
    }}
/>;
```

---

## Field Types

### String Input

```tsx
{
  type: "string",
  view: {
    label: "Name",
    placeholder: "Enter name",
    description: "Your full name",
  },
}
```

**Generated UI:**

-   Text input field
-   Placeholder text
-   Help text below field

---

### Number Input

```tsx
{
  type: "number",
  view: {
    label: "Age",
  },
  min: 0,
  max: 120,
}
```

**Generated UI:**

-   Number input with constraints
-   Min/max validation

---

### Boolean (Checkbox)

```tsx
{
  type: "boolean",
  view: {
    component: "CheckboxView",
    label: "Accept Terms",
  },
}
```

**Generated UI:**

-   Material-UI checkbox

---

### Dropdown (Single Select)

```tsx
{
  type: "string",
  view: {
    component: "DropdownView",
    label: "Category",
    choices: [
      { value: "opt1", label: "Option 1" },
      { value: "opt2", label: "Option 2" },
      { value: "opt3", label: "Option 3" },
    ],
  },
}
```

**Generated UI:**

-   Custom Dropdown widget (wraps SchemaIO DropdownView)
-   Single selection

---

### Dropdown (Multiple Select)

```tsx
{
  type: "string",
  view: {
    component: "DropdownView",
    label: "Categories",
    multiple: true,
    choices: [
      { value: "opt1", label: "Option 1" },
      { value: "opt2", label: "Option 2" },
    ],
  },
}
```

**Generated UI:**

-   Multi-select dropdown
-   Returns array of selected values

---

### Autocomplete (Single)

```tsx
{
  type: "string",
  view: {
    component: "AutocompleteView",
    label: "Select Tag",
    allow_user_input: true,
    choices: [
      { value: "tag1", label: "Tag 1" },
      { value: "tag2", label: "Tag 2" },
    ],
  },
}
```

**Generated UI:**

-   Custom AutoComplete widget (wraps SchemaIO AutocompleteView)
-   Searchable dropdown
-   Optional free text input

---

### Autocomplete (Multiple / Tags)

```tsx
{
  type: "array",
  view: {
    component: "AutocompleteView",
    label: "Tags",
    allow_user_input: true,
    allow_duplicates: false,
    choices: [
      { value: "tag1", label: "Tag 1" },
      { value: "tag2", label: "Tag 2" },
      { value: "tag3", label: "Tag 3" },
    ],
  },
}
```

**Generated UI:**

-   Multi-select autocomplete with chips
-   Add custom tags if `allow_user_input: true`
-   Prevent duplicates if `allow_duplicates: false`

---

### Radio Buttons

```tsx
{
  type: "string",
  view: {
    component: "RadioView",
    label: "Status",
    choices: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "pending", label: "Pending" },
    ],
  },
}
```

**Generated UI:**

-   Radio button group
-   Single selection

---

### Color Picker

```tsx
{
  type: "string",
  view: {
    component: "ColorView",
    label: "Theme Color",
  },
}
```

**Generated UI:**

-   Color picker widget
-   Returns hex color string

---

### Text Area

```tsx
{
  type: "string",
  view: {
    component: "CodeView",
    label: "Code",
    language: "javascript",
  },
}
```

**Generated UI:**

-   Multi-line textarea (10 rows)
-   Warning: Consider custom widget for syntax highlighting

---

### File Upload

```tsx
{
  type: "string",
  view: {
    component: "FileView",
    label: "Upload File",
  },
}
```

**Generated UI:**

-   File input widget
-   Returns file path/data

---

### Array (List)

```tsx
{
  type: "array",
  view: {
    component: "ListView",
    label: "Items",
  },
  items: {
    type: "string",
    view: { label: "Item" },
  },
}
```

**Generated UI:**

-   Add/remove buttons
-   List of text inputs

---

### Object (Nested Fields)

```tsx
{
  type: "object",
  view: {
    component: "ObjectView",
    label: "Person",
  },
  properties: {
    firstName: {
      type: "string",
      view: { label: "First Name" },
    },
    lastName: {
      type: "string",
      view: { label: "Last Name" },
    },
  },
}
```

**Generated UI:**

-   Nested fieldset
-   Groups related fields

---

## Advanced Features

### Custom UI Schema

Override generated UI schema for specific fields:

```tsx
const schema = {
    type: "object",
    properties: {
        name: {
            type: "string",
            view: { label: "Name" },
        },
        email: {
            type: "string",
            view: { label: "Email" },
        },
    },
};

const uiSchema = {
    name: {
        "ui:placeholder": "John Doe",
        "ui:help": "Your display name",
    },
    email: {
        "ui:widget": "email",
        "ui:placeholder": "you@example.com",
    },
};

<SmartForm
    schema={schema}
    uiSchema={uiSchema} // Overrides generated UI schema
    data={data}
    onChange={handleChange}
/>;
```

---

### Required Fields

```tsx
{
  type: "object",
  properties: {
    name: {
      type: "string",
      view: { label: "Name" },
      required: true,  // ← Required field
    },
    email: {
      type: "string",
      view: { label: "Email" },
      required: true,  // ← Required field
    },
  },
}
```

**Generated UI:**

-   Asterisk (\*) next to label
-   Validation on submit

---

### Read-Only Fields

```tsx
{
  type: "string",
  view: {
    label: "ID",
    readOnly: true,  // or read_only: true
  },
}
```

**Generated UI:**

-   Disabled/non-editable field

---

### Default Values

```tsx
{
  type: "string",
  view: { label: "Country" },
  default: "USA",  // ← Default value
}
```

**Generated UI:**

-   Pre-populated with default value

---

### Field Validation

```tsx
{
  type: "string",
  view: { label: "Email" },
  pattern: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",  // Email regex
}

{
  type: "number",
  view: { label: "Age" },
  min: 18,
  max: 100,
}

{
  type: "string",
  view: { label: "Username" },
  minLength: 3,
  maxLength: 20,
}
```

**Generated UI:**

-   Client-side validation
-   Error messages

---

### Live Validation

**Default Behavior (Live Validation Enabled):**

```tsx
<SmartForm
    schema={schema}
    data={data}
    onChange={(data) => console.log(data)}
/>
```

**Result:**
- Validation errors appear inline as users type
- Immediate feedback for incorrect input
- Better user experience for complex forms

---

### Disable Live Validation

---

### Custom Validator

**Using Custom Validator with Options:**

```tsx
import { customizeValidator } from "@rjsf/validator-ajv8";

const customValidator = customizeValidator({
    ajvOptionsOverrides: {
        allErrors: true,        // Show all validation errors
        verbose: true,          // Include detailed error info
        $data: true,            // Support $data references
        formats: {
            // Custom format validators
            "phone": /^\d{3}-\d{3}-\d{4}$/,
        },
    },
});

const schema = {
    type: "object",
    properties: {
        phone: {
            type: "string",
            view: { label: "Phone Number" },
            format: "phone",
        },
    },
};

<SmartForm
    schema={schema}
    validator={customValidator}
/>;
```

**Result:**
- Custom validation rules applied
- Enhanced error messages
- Support for custom formats

---

### Validation with Complex Rules

**Complete validation example:**

```tsx
import SmartForm from "@fiftyone/components/SmartForm";
import { customizeValidator } from "@rjsf/validator-ajv8";

const validator = customizeValidator({
    ajvOptionsOverrides: { allErrors: true },
});

const schema = {
    type: "object",
    properties: {
        email: {
            type: "string",
            view: {
                label: "Email Address",
                description: "We'll never share your email",
            },
            pattern: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$",
            required: true,
        },
        password: {
            type: "string",
            view: {
                label: "Password",
                description: "Must be at least 8 characters",
            },
            minLength: 8,
            required: true,
        },
        age: {
            type: "number",
            view: {
                label: "Age",
                description: "Must be 18 or older",
            },
            min: 18,
            max: 120,
        },
        website: {
            type: "string",
            view: { label: "Website (optional)" },
            pattern: "^https?://.*",
        },
    },
};

function RegistrationForm() {
    const [formData, setFormData] = useState({});
    const [errors, setErrors] = useState<string[]>([]);

    const handleSubmit = (data) => {
        setErrors([]);
        console.log("Valid form data:", data);
        // Submit to API
    };

    return (
        <SmartForm
            schema={schema}
            data={formData}
            validator={validator}
            onChange={setFormData}
            onSubmit={handleSubmit}
        />
    );
}
```

**Features:**
- Email pattern validation with live feedback
- Password length requirement
- Age range validation
- Optional URL pattern validation
- All validation errors shown simultaneously

---

### Conditional Fields

```tsx
{
  type: "object",
  properties: {
    hasAccount: {
      type: "boolean",
      view: { label: "Existing Account?" },
    },
    email: {
      type: "string",
      view: { label: "Email" },
    },
    password: {
      type: "string",
      view: { label: "Password" },
    },
  },
  // Note: Conditional display requires custom logic
}
```

---

### Array of Objects

```tsx
{
  type: "array",
  view: {
    component: "ListView",
    label: "Addresses",
  },
  items: {
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
      zipCode: {
        type: "string",
        view: { label: "Zip Code" },
      },
    },
  },
}
```

**Generated UI:**

-   Add/remove address buttons
-   Each address has street/city/zip fields

---

### Tuple (Fixed Array)

```tsx
{
  type: "array",
  view: {
    component: "TupleView",
    label: "Coordinates",
  },
  items: [
    {
      type: "number",
      view: { label: "Latitude" },
    },
    {
      type: "number",
      view: { label: "Longitude" },
    },
  ],
}
```

**Generated UI:**

-   Fixed number of fields (2)
-   No add/remove buttons

---

## Translation API

### translateSchemaComplete

Main translation function used by SmartForm:

```tsx
import { translateSchemaComplete } from "@fiftyone/components/SmartForm/translators";

const schemaIO = {
    type: "string",
    view: {
        component: "DropdownView",
        choices: [
            { value: "a", label: "Option A" },
            { value: "b", label: "Option B" },
        ],
    },
};

const data = "a";

const result = translateSchemaComplete(schemaIO, data);

console.log(result.schema); // JSON Schema
console.log(result.uiSchema); // UI Schema
console.log(result.formData); // Converted data
console.log(result.warnings); // Translation warnings
```

**Returns:**

```tsx
{
  schema: {
    type: "string",
    enum: ["a", "b"],
    enumNames: ["Option A", "Option B"]
  },
  uiSchema: {
    "ui:widget": "Dropdown",
    "ui:submitButtonOptions": { norender: true }
  },
  formData: "a",
  warnings: []
}
```

---

### translateSchema

Translate without choice processing:

```tsx
import { translateSchema } from "@fiftyone/components/SmartForm/translators";

const result = translateSchema(schemaIO, { strictMode: false });
// Returns: { schema, uiSchema, warnings }
```

---

### Type Guards

Check schema format:

```tsx
import {
    isSchemaIOSchema,
    isJSONSchema,
} from "@fiftyone/components/SmartForm";

const schema1 = { type: "string", view: { component: "FieldView" } };
const schema2 = { type: "string", title: "Name" };

if (isSchemaIOSchema(schema1)) {
    // schema1 is SchemaType
    console.log(schema1.view.component);
}

if (isJSONSchema(schema2)) {
    // schema2 is RJSFSchema
    console.log(schema2.title);
}
```

---

## Custom Widgets

SmartForm includes custom widgets that wrap SchemaIO components:

### Available Widgets

1. **AutoComplete** - Wraps SchemaIO's AutocompleteView
2. **Dropdown** - Wraps SchemaIO's DropdownView
3. **TextWidget** - Custom text input with label wrapper

### Using Custom Widgets

Widgets are automatically selected based on `view.component`:

```tsx
// Automatically uses AutoComplete widget
{
  type: "array",
  view: {
    component: "AutocompleteView",  // ← Triggers AutoComplete widget
    choices: [...]
  }
}

// Automatically uses Dropdown widget
{
  type: "string",
  view: {
    component: "DropdownView",  // ← Triggers Dropdown widget
    choices: [...]
  }
}
```

---

## Type Safety

### Component Props

```tsx
import SmartForm, {
    type SmartFormProps,
} from "@fiftyone/components/SmartForm";

const props: SmartFormProps = {
    schema: schemaIO, // SchemaType (required)
    data: initialData, // unknown (optional)
    uiSchema: customUISchema, // UiSchema (optional)
    validator: customValidator, // ValidatorType (optional)
    onChange: (data: unknown) => {}, // Function (optional)
    onSubmit: (data: unknown) => {}, // Function (optional)
};

<SmartForm {...props} />;
```

---

### Translation Types

```tsx
import type {
    TranslationResult,
    TranslationOptions,
} from "@fiftyone/components/SmartForm/translators";

const options: TranslationOptions = {
    strictMode: true, // Throw errors on unsupported features
};

const result: TranslationResult = translateSchemaComplete(
    schema,
    data,
    options
);

// result.schema: RJSFSchema
// result.uiSchema: UiSchema
// result.formData?: unknown
// result.warnings: string[]
```

---

## Real-World Example: Annotation Form

Complete example from the FiftyOne codebase:

```tsx
import SmartForm from "@fiftyone/components/SmartForm";

const annotationSchema = {
    type: "object",
    view: { component: "ObjectView" },
    properties: {
        // Dropdown for label
        label: {
            type: "string",
            view: {
                component: "DropdownView",
                label: "Label",
                choices: [
                    { value: "cat", label: "Cat" },
                    { value: "dog", label: "Dog" },
                    { value: "bird", label: "Bird" },
                ],
            },
        },

        // Number input for confidence
        confidence: {
            type: "number",
            view: {
                label: "Confidence",
                description: "Detection confidence (0-1)",
            },
            min: 0,
            max: 1,
        },

        // Radio buttons for status
        status: {
            type: "string",
            view: {
                component: "RadioView",
                label: "Status",
                choices: [
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                ],
            },
        },

        // Multi-select tags
        tags: {
            type: "array",
            view: {
                component: "AutocompleteView",
                label: "Tags",
                allow_user_input: false,
                choices: [
                    { value: "indoor", label: "Indoor" },
                    { value: "outdoor", label: "Outdoor" },
                    { value: "daytime", label: "Daytime" },
                    { value: "nighttime", label: "Nighttime" },
                ],
            },
            required: true,
        },
    },
};

const initialData = {
    label: "cat",
    confidence: 0.95,
    status: "active",
    tags: ["indoor", "daytime"],
};

function AnnotationEditor() {
    const [data, setData] = useState(initialData);

    return (
        <SmartForm
            schema={annotationSchema}
            data={data}
            onChange={(newData) => {
                setData(newData);
                // Auto-save
                saveAnnotation(newData);
            }}
            onSubmit={(finalData) => {
                // Explicit save
                console.log("Final data:", finalData);
            }}
        />
    );
}
```

---

## Tips & Best Practices

### 1. Use Translation Warnings

```tsx
const { warnings } = translateSchemaComplete(schema, data);
if (warnings.length > 0) {
    console.warn("Schema translation warnings:", warnings);
}
```

### 2. Provide Custom UI Schema for Fine Control

```tsx
const uiSchema = {
    name: {
        "ui:placeholder": "Enter name",
        "ui:help": "This will be displayed publicly",
    },
    email: {
        "ui:widget": "email",
    },
};
```

### 3. Handle Data Conversion

SmartForm automatically converts between formats, but be aware:

-   SchemaIO uses `null` for empty values
-   RJSF uses `undefined`, `""`, or `[]` for empty values

### 4. Type Your Schemas

```tsx
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

const schema: SchemaType = {
    type: "object",
    view: { component: "ObjectView" },
    properties: {
        // ...
    },
};
```

### 5. Use Type Guards

```tsx
if (isSchemaIOSchema(schema)) {
    // Safe to use with SmartForm
    <SmartForm schema={schema} />;
}
```

---

## Migration from SchemaIO

To migrate from SchemaIO's DynamicIO to SmartForm:

**Before:**

```tsx
import { SchemaIOComponent } from "@fiftyone/core/plugins/SchemaIO";

<SchemaIOComponent
    schema={schema}
    data={data}
    onChange={(data, liteValues) => handleChange(data)}
/>;
```

**After:**

```tsx
import SmartForm from "@fiftyone/components/SmartForm";

<SmartForm
    schema={schema}
    data={data}
    onChange={(data) => handleChange(data)}
/>;
```

Or use the unified component:

```tsx
<SchemaIOComponent
    useJSONSchema={true} // ← Force SmartForm
    schema={schema}
    data={data}
    onChange={(data) => handleChange(data)}
/>
```

---

## Troubleshooting

### Issue: Unsupported Component Warning

**Warning:**
`Custom component "PlotlyView" requires custom widget implementation`

**Solution:** These components don't have RJSF equivalents. Either:

1. Create a custom widget
2. Use SchemaIO renderer: `<SchemaIOComponent useJSONSchema={false} />`

### Issue: Data Not Converting Correctly

Check your schema types match your data:

```tsx
// Wrong
{ type: "string", value: 123 }

// Correct
{ type: "number", value: 123 }
```

### Issue: Dropdown Not Showing Choices

Ensure choices are properly formatted:

```tsx
view: {
  component: "DropdownView",
  choices: [
    { value: "key", label: "Display Text" }  // ✓ Correct
    // Not: ["option1", "option2"]  // ✗ Wrong
  ]
}
```
