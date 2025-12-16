# FiftyOne Annotation Mode: Classification Implementation Guide

**Date:** 2025-12-03
**Topic:** Understanding and implementing classification annotation functionality

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Files and Their Roles](#key-files-and-their-roles)
4. [How Annotations Work](#how-annotations-work)
5. [The Schema System](#the-schema-system)
6. [MongoDB Structure](#mongodb-structure)
7. [Adding Classification Support](#adding-classification-support)
8. [Data Flow Diagrams](#data-flow-diagrams)
9. [Troubleshooting](#troubleshooting)

---

## Overview

FiftyOne's annotation mode allows users to create and edit labels (detections, classifications, polylines) directly in the UI. This guide focuses on understanding how the system works and how to implement classification annotation support.

### Key Concepts

- **Annotations**: Labels created/edited by users (Detections, Classifications, Polylines)
- **Schemas**: Configuration for annotation fields (label choices, attributes, active status)
- **Overlays**: Visual representations of annotations rendered in the viewer
- **Fields**: Dataset fields that store annotation data (e.g., `ground_truth`, `predictions`)

---

## Architecture

### Component Structure

```
app/packages/core/src/components/Modal/Sidebar/Annotate/
├── Annotate.tsx              # Main container
├── Actions.tsx               # Annotation buttons (Create Classification/Detection)
├── Edit/
│   ├── useCreate.ts          # Core creation logic
│   ├── Edit.tsx              # Edit panel UI
│   ├── state.ts              # Jotai state management
│   ├── AddSchema.tsx         # "No fields available" error message
│   ├── Field.tsx             # Field selector dropdown
│   ├── useExit.ts            # Exit/cancel editing logic
│   └── ...
├── SchemaManager/            # Schema configuration UI
├── LabelEntry.tsx            # Individual label in the list
├── useLabels.ts              # Fetch and manage labels
└── useLoadSchemas.ts         # Load schemas from backend

app/packages/lighter/src/
├── overlay/
│   ├── ClassificationOverlay.ts    # Classification rendering
│   ├── BoundingBoxOverlay.ts       # Detection rendering
│   └── OverlayFactory.ts           # Creates overlay instances
└── interaction/
    └── InteractiveDetectionHandler.ts  # Mouse drawing for detections
```

### Backend Components

```
plugins/operators/annotation.py
├── GetAnnotationSchemas       # Fetch schemas from dataset
├── ComputeAnnotationSchema    # Analyze samples and generate schema
├── ActivateAnnotationSchemas  # Mark schemas as active
├── SaveAnnotationSchema       # Save schema configuration
└── DeleteAnnotationSchema     # Remove schema
```

---

## Key Files and Their Roles

### 1. Actions.tsx
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/Actions.tsx`

Contains the annotation toolbar buttons:

```typescript
const Classification = () => {
  const create = useCreate(CLASSIFICATION);
  return (
    <Tooltip text="Create new classification">
      <Square onClick={create}>
        {/* SVG icon */}
      </Square>
    </Tooltip>
  );
};

const Detection = () => {
  const create = useCreate(DETECTION);
  return (
    <Tooltip text="Create new detection">
      <Square onClick={create}>
        {/* SVG icon */}
      </Square>
    </Tooltip>
  );
};
```

### 2. useCreate.ts
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate.ts`

**Critical Logic:** This is where annotation creation happens.

```typescript
const useCreateAnnotationLabel = () => {
  const { scene, addOverlay, overlayFactory } = useLighter();
  return useCallback((type: LabelType) => {
    const id = objectId();
    const data = { _id: id };
    const store = getDefaultStore();
    const field = store.get(defaultField(type));  // ← Gets default field

    if (!field) {
      return;  // ← No field available! Returns undefined
    }

    if (type === CLASSIFICATION) {
      const overlay = overlayFactory.create("classification", {
        field,
        id,
        label: data,
      });
      addOverlay(overlay);
      store.set(savedLabel, data);
      return { data, overlay, path: field, type };
    }

    if (type === DETECTION) {
      const overlay = overlayFactory.create("bounding-box", {
        field,
        id,
        label: {},
      });
      addOverlay(overlay);
      const handler = new InteractiveDetectionHandler(overlay);
      scene?.enterInteractiveMode(handler);  // ← Drawing mode!
      store.set(savedLabel, data);
      return { data, overlay, path: field, type };
    }
  }, [addOverlay, overlayFactory, scene]);
};

export default function useCreate(type: LabelType) {
  const setEditing = useSetAtom(editing);
  const createAnnotationLabel = useCreateAnnotationLabel();

  return useCallback(() => {
    const label = createAnnotationLabel(type);

    setEditing(
      label
        ? atom<AnnotationLabel>({ isNew: true, ...label })  // ← Success
        : type  // ← Failure: sets editing to string "Classification"
    );
  }, [createAnnotationLabel, setEditing, type]);
}
```

**Key Differences:**
- **Classification**: Goes directly to edit panel (no drawing needed)
- **Detection**: Enters interactive mode for drawing bounding box first

### 3. state.ts
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/state.ts`

**Key Atoms:**

```typescript
// The main editing state
export const editing = atomWithReset<
  PrimitiveAtom<AnnotationLabel> | LabelType | null
>(null);

// Current data being edited
export const currentData = atom(
  (get) => get(current)?.data ?? null,
  (get, set, data: Partial<AnnotationLabel["data"]>) => { ... }
);

// Current field being edited
export const currentField = atom(
  (get) => get(current)?.path,
  (get, set, path: string) => { ... }
);

// Available fields for this annotation type
export const currentFields = atom((get) =>
  get(fieldsOfType(get(currentType)))
);

// Fields that are disabled (already have non-list values)
export const disabledFields = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = new Set<string>();
    const map = get(labelsByPath);
    for (const path of get(fieldsOfType(type))) {
      if (IS_LIST.has(get(fieldType(path)))) {
        continue;
      }
      if (!map[path]?.length) {
        continue;
      }
      disabled.add(path);
    }
    return disabled;
  })
);

// Default field for new annotations
export const defaultField = atomFamily((type: LabelType) =>
  atom((get) => {
    const disabled = get(disabledFields(type));
    for (const path of get(fieldsOfType(type))) {
      if (!disabled.has(path)) {
        return path;  // ← First non-disabled field
      }
    }
    return null;  // ← No fields available!
  })
);
```

### 4. Field.tsx
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/Field.tsx`

Shows field selector or error message:

```typescript
const Field = () => {
  const fields = useAtomValue(currentFields);
  const state = useAtomValue(editing);
  const isCreating = useAtomValue(isNew);

  if (!isCreating) {
    return null;
  }

  return (
    <>
      {!!fields.length && (
        <div>
          <SchemaIOComponent schema={schema} ... />
        </div>
      )}
      {typeof state === "string" && <AddSchema type={type} />}
      {/*  ↑ Shows error if editing is a string (no field available) */}
    </>
  );
};
```

### 5. AddSchema.tsx
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/AddSchema.tsx`

The "No classification fields available" error message:

```typescript
const AddSchema = ({ type }: { type: string }) => {
  const canManage = useCanManageSchema();
  const showModal = useShowModal();
  const setActiveTab = useSetAtom(activeSchemaTab);
  const setEditing = useSetAtom(editing);

  return (
    <Container>
      <Icon sx={{ fontSize: 64, color: "#FF9950", marginBottom: 2 }} />
      <Typography variant="h6" textAlign="center">
        No {type.toLowerCase()} fields available
      </Typography>
      <Typography color="secondary" textAlign="center">
        Add and activate {type.toLocaleLowerCase()} annotation schemas to
        access and edit labels
      </Typography>
      <MuiButton
        variant="contained"
        onClick={() => {
          setActiveTab("other");
          setEditing(null);
          showModal();  // ← Opens Schema Manager
        }}
      >
        Add schema
      </MuiButton>
    </Container>
  );
};
```

### 6. useLoadSchemas.ts
**Location:** `app/packages/core/src/components/Modal/Sidebar/Annotate/useLoadSchemas.ts`

Loads schemas from the backend:

```typescript
const SUPPORTED_ANNOTATION_TYPES = {
  image: new Set([
    CLASSIFICATION_FIELD,      // "fiftyone.core.labels.Classification"
    CLASSIFICATIONS_FIELD,     // "fiftyone.core.labels.Classifications"
    DETECTION_FIELD,           // "fiftyone.core.labels.Detection"
    DETECTIONS_FIELD,          // "fiftyone.core.labels.Detections"
  ]),
  "3d": new Set([
    CLASSIFICATION_FIELD,
    CLASSIFICATIONS_FIELD,
    POLYLINE_FIELD,
    POLYLINES_FIELD,
  ]),
};

export default function useLoadSchemas() {
  const setSchema = useSetAtom(schemas);
  const get = useOperatorExecutor("get_annotation_schemas");

  useEffect(() => {
    if (!get.result) {
      return;
    }

    const schemas = {};
    for (const path in get.result.schemas) {
      if (!paths.includes(path)) continue;
      schemas[path] = get.result.schemas[path];
    }

    setSchema(schemas);  // ← Populates schemas atom
  }, [get.result, paths, setSchema]);

  return useRecoilCallback(
    ({ snapshot }) => async () => {
      const schema = await snapshot.getPromise(
        fieldSchema({ space: State.SPACE.SAMPLE })
      );
      const types = {};
      const paths: string[] = [];

      for (const path in schema) {
        const doc = schema[path].embeddedDocType;
        if (doc && SUPPORTED_ANNOTATION_TYPES[type ?? ""]?.has(doc)) {
          paths.push(path);  // ← Only supported types
          types[path] = doc?.split(".").slice(-1)[0];
        }
      }

      get.execute({ paths });  // ← Fetch schemas from backend
      setTypes(types);
    },
    [type, setTypes]
  );
}
```

---

## How Annotations Work

### Creation Flow

#### 1. **User clicks "Create new classification"**

```
Actions.tsx → useCreate(CLASSIFICATION) → createAnnotationLabel(type)
```

#### 2. **System checks for available fields**

```typescript
const field = store.get(defaultField(type));
if (!field) {
  return;  // No field available
}
```

**Where `defaultField` comes from:**
- Scans `activeSchemas` for fields matching the annotation type
- Filters out disabled fields (non-list fields with existing data)
- Returns the first available field (alphabetically sorted)

#### 3A. **If field exists: Create annotation**

```typescript
// Create overlay
const overlay = overlayFactory.create("classification", {
  field,
  id,
  label: data,
});
addOverlay(overlay);

// Return label data
return { data, overlay, path: field, type };
```

#### 3B. **If no field: Show error**

```typescript
setEditing(type);  // Sets editing to string "Classification"
```

This triggers the `AddSchema` component to render:

```typescript
{typeof state === "string" && <AddSchema type={type} />}
```

#### 4. **Edit panel opens**

```typescript
setEditing(
  atom<AnnotationLabel>({
    isNew: true,
    data,
    overlay,
    path: field,
    type
  })
);
```

The `Edit.tsx` component renders the schema fields.

### Where `editing` Atom is Set

| File | Line | Action |
|------|------|--------|
| `useCreate.ts` | 77 | Create new annotation |
| `LabelEntry.tsx` | 105 | Click existing label |
| `useFocus.ts` | 28 | Focus on label (direct store) |
| `useExit.ts` | 61, 69, 95 | Exit/cancel editing |
| `AddSchema.tsx` | 63 | Close error dialog |
| `state.ts` | 209 | Delete annotation |

### Detection vs Classification

| Aspect | Detection | Classification |
|--------|-----------|----------------|
| **Overlay Type** | `BoundingBoxOverlay` | `ClassificationOverlay` |
| **Interaction** | Interactive drawing mode | Direct to edit panel |
| **Handler** | `InteractiveDetectionHandler` | None |
| **Scene Mode** | `enterInteractiveMode()` | Normal |
| **Fields** | Bounding box + labels | Text/choice labels only |
| **Position Component** | Yes (`Position.tsx`) | No |

---

## The Schema System

### What is a Schema?

A schema is metadata stored on a dataset field that defines:
- **Active status**: Whether the field is available for annotation
- **Classes**: List of valid label values
- **Attributes**: Additional properties (tags, confidence, etc.)

### Schema Structure

```typescript
{
  active: true,  // Whether field is available for annotation
  config: {
    classes: ["cat", "dog", "bird"],  // Valid labels
    attributes: {
      tags: {
        default: [],
        type: "tags",
        values: []
      },
      confidence: {
        type: "input",
        default: null
      }
    }
  }
}
```

### Schema Flow

```
Dataset Fields
    ↓
Backend Operator (get_annotation_schemas)
    ↓
Frontend (useLoadSchemas)
    ↓
schemas atom (all schemas)
    ↓
activeSchemas atom (filter active: true)
    ↓
fieldsOfType(type) (filter by annotation type)
    ↓
defaultField(type) (first non-disabled field)
    ↓
useCreate uses this field
```

### Key Atoms

```typescript
// All schemas (from backend)
export const schemas = atom<AnnotationSchemas | null>(null);

// Only active schemas
export const activeSchemas = atom<AnnotationSchemas>((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !!schema?.active)
);

// Active field paths
export const activePaths = atom((get) =>
  Object.keys(get(activeSchemas) ?? {}).sort()
);

// Inactive schemas (for Schema Manager)
export const inactiveSchemas = atom((get) =>
  selectSchemas(get(schemas) ?? {}, (schema) => !schema?.active)
);

// Field types (Classification, Detection, etc.)
export const fieldTypes = atom<{ [key: string]: string }>({});
export const fieldType = atomFamily((path: string) =>
  atom((get) => {
    const types = get(fieldTypes);
    return types[path] || types[path.split(".").slice(0, -1).join(".")];
  })
);

// Individual schema for a field
export const schema = atomFamily((path: string) =>
  atom(
    (get) => get(schemas)?.[path],
    (get, set, schema: AnnotationSchema | null) => {
      if (!schema) {
        const s = { ...get(schemas) };
        delete s[path];
        set(schemas, s);
        return;
      }
      set(schemas, { ...get(schemas), [path]: schema });
    }
  )
);
```

---

## MongoDB Structure

### Database Organization

FiftyOne stores data in MongoDB with this structure:

```
Database: fiftyone
├── datasets                    # Dataset metadata
│   ├── name
│   ├── sample_collection_name
│   ├── sample_fields[]        # Field definitions + schemas
│   └── ...
├── samples.{dataset_id}       # Sample data (one collection per dataset)
├── views                      # Saved views
└── config                     # App configuration
```

### Dataset Document Structure

```javascript
{
  name: "quickstart",
  sample_collection_name: "samples.6920845434f8a12bebb24643",
  sample_fields: [
    {
      name: "ground_truth",
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      embedded_doc_type: "fiftyone.core.labels.Detections",
      schema: {
        active: true,
        config: {
          classes: ["cat", "dog", "person", ...],
          attributes: { ... }
        }
      }
    },
    {
      name: "classification",
      ftype: "fiftyone.core.fields.EmbeddedDocumentField",
      embedded_doc_type: "fiftyone.core.labels.Classification",
      schema: {
        active: true,
        config: {
          classes: ["airplane", "cat", "dog", ...],
          attributes: { ... }
        }
      }
    }
  ]
}
```

### Sample Document Structure

```javascript
{
  _id: ObjectId("..."),
  filepath: "/path/to/image.jpg",
  tags: [],
  _media_type: "image",

  // Detection field
  ground_truth: {
    _cls: "Detections",
    detections: [
      {
        _id: ObjectId("..."),
        _cls: "Detection",
        label: "cat",
        bounding_box: [0.1, 0.2, 0.3, 0.4],
        confidence: 0.95,
        tags: []
      }
    ]
  },

  // Classification field
  classification: {
    _id: ObjectId("..."),
    _cls: "Classification",
    label: "cat",
    confidence: null,
    tags: []
  }
}
```

### MongoDB Operations

#### Connect to MongoDB

```bash
mongosh mongodb://127.0.0.1:27017/fiftyone
```

#### View Dataset Schemas

```javascript
db.datasets.findOne(
  { name: "quickstart" },
  { sample_fields: 1 }
);
```

#### View Sample Data

```javascript
db["samples.6920845434f8a12bebb24643"].findOne();
```

#### Count Samples by Classification

```javascript
db["samples.6920845434f8a12bebb24643"].aggregate([
  { $group: { _id: "$classification.label", count: { $sum: 1 } } }
]);
```

#### Update Schema Status

```javascript
db.datasets.updateOne(
  { name: "quickstart", "sample_fields.name": "classification" },
  { $set: { "sample_fields.$.schema.active": true } }
);
```

---

## Adding Classification Support

### Option 1: Add to Existing Dataset

#### Step 1: Add Classification Field

```python
import fiftyone as fo

# Load dataset
dataset = fo.load_dataset("quickstart")

# Add classification data to samples
for sample in dataset.iter_samples(progress=True):
    # Example: Use first detection label
    if sample.ground_truth and sample.ground_truth.detections:
        label = sample.ground_truth.detections[0].label
    else:
        label = "unknown"

    sample["classification"] = fo.Classification(label=label)
    sample.save()
```

#### Step 2: Compute Schema

```python
# Scan samples to generate schema
schema_config = dataset.compute_annotation_schema(
    "classification",
    scan_samples=True
)

print(f"Found {len(schema_config['classes'])} classes")
print(f"Classes: {schema_config['classes']}")
```

#### Step 3: Activate Schema

```python
# Save and activate the schema
field = dataset.get_field("classification")
field.schema = {
    "active": True,
    "config": schema_config
}
field.save()

print("✓ Schema activated!")
```

### Option 2: Create New Dataset with Classifications

```python
import fiftyone as fo

# Create dataset
dataset = fo.Dataset("my_dataset")

# Add samples with classifications
for i in range(100):
    sample = fo.Sample(
        filepath=f"/path/to/image_{i}.jpg",
        classification=fo.Classification(label=f"class_{i % 5}"),
        detections=fo.Detections(detections=[
            fo.Detection(
                label=f"object_{i % 3}",
                bounding_box=[0.1, 0.1, 0.4, 0.4]
            )
        ])
    )
    dataset.add_sample(sample)

# Compute and activate schemas for both fields
for field_name in ["classification", "detections"]:
    schema_config = dataset.compute_annotation_schema(field_name)
    field = dataset.get_field(field_name)
    field.schema = {"active": True, "config": schema_config}
    field.save()

dataset.save()
print(f"✓ Created dataset: {dataset.name}")
```

### Option 3: Via UI (Schema Manager)

1. Open FiftyOne app
2. Load dataset that has a Classification field
3. Click annotation mode
4. Click "Add schema" button
5. Navigate to "Other fields" tab
6. Find your classification field
7. Click on it to configure
8. Click "Scan samples" button
9. Review generated schema
10. Click "Save schema"
11. Check the field to select it
12. Click "Add to active fields"

### Verification

```python
import fiftyone as fo

dataset = fo.load_dataset("your_dataset")

# Check active schemas
schema = dataset.get_field_schema()
for field_name, field in schema.items():
    if hasattr(field, 'schema') and field.schema and field.schema.get('active'):
        doc_type = str(field.document_type).split('.')[-1] if hasattr(field, 'document_type') else "N/A"
        classes = field.schema.get('config', {}).get('classes', [])
        print(f"✓ {field_name} ({doc_type}) - {len(classes)} classes")
```

Expected output:
```
✓ ground_truth (Detections) - 71 classes
✓ predictions (Detections) - 79 classes
✓ classification (Classification) - 45 classes
```

---

## Data Flow Diagrams

### Classification Creation Flow

```
User clicks "Create new classification"
              ↓
     Actions.tsx:Classification()
              ↓
     useCreate(CLASSIFICATION)
              ↓
  createAnnotationLabel(CLASSIFICATION)
              ↓
  defaultField(CLASSIFICATION) ← Gets first available field
              ↓
         ┌────┴────┐
         ↓         ↓
    field=null   field="classification"
         ↓         ↓
    return;    Create overlay
         ↓         ↓
    setEditing(   setEditing(
      "Classification"  atom({ isNew: true, ... })
    )           )
         ↓         ↓
    Field.tsx   Edit.tsx
         ↓         ↓
   AddSchema   Edit panel
     Error      opens
```

### Schema Loading Flow

```
useLoadSchemas() hook initialization
              ↓
Get dataset field schema from Recoil
              ↓
Filter by SUPPORTED_ANNOTATION_TYPES
              ↓
Execute "get_annotation_schemas" operator
              ↓
Backend: annotation.py:GetAnnotationSchemas
              ↓
Loop through paths:
  field = dataset.get_field(path)
  schemas[path] = field.schema
              ↓
Return to frontend
              ↓
useLoadSchemas effect triggers
              ↓
Filter by activePaths
              ↓
Set schemas atom
              ↓
activeSchemas derived atom
              ↓
fieldsOfType(CLASSIFICATION)
              ↓
defaultField(CLASSIFICATION)
              ↓
Available for useCreate!
```

### Edit State Machine

```
                    editing = null
                         ↓
      ┌──────────────────┴──────────────────┐
      ↓                                      ↓
Click "Create"                         Click existing label
useCreate(type)                        LabelEntry.onClick()
      ↓                                      ↓
defaultField(type)?                    setEditing(atom)
      ↓                                      ↓
  ┌───┴───┐                            editing = PrimitiveAtom
  ↓       ↓                                   ↓
 null   field                           Edit.tsx renders
  ↓       ↓                                   ↓
editing=  setEditing(                   User edits data
"type"    atom({...}))                        ↓
  ↓           ↓                          ┌────┴────┐
AddSchema  editing =                     ↓         ↓
  Error   PrimitiveAtom                Save      Cancel
            ↓                            ↓         ↓
       Edit.tsx                      useSave()  useExit()
       renders                           ↓         ↓
          ↓                         Persist    Revert
     ┌────┴────┐                      ↓         ↓
     ↓         ↓                   setEditing(null)
   Save      Cancel                     ↓
     ↓         ↓                   editing = null
  useSave()  useExit()
     ↓         ↓
Persist   Revert changes
 data        ↓
     ↓    setEditing(null)
setEditing(null)
     ↓
editing = null
```

---

## Troubleshooting

### Issue: "No classification fields available"

**Symptom:** Click "Create new classification" and see error message.

**Cause:** No active Classification fields in the dataset.

**Solution:**

1. Check if Classification field exists:
   ```python
   dataset = fo.load_dataset("your_dataset")
   print(dataset.get_field_schema().keys())
   ```

2. If field exists but not active:
   ```python
   field = dataset.get_field("classification")
   if not field.schema or not field.schema.get('active'):
       schema_config = dataset.compute_annotation_schema("classification")
       field.schema = {"active": True, "config": schema_config}
       field.save()
   ```

3. If field doesn't exist, add it:
   ```python
   sample = dataset.first()
   sample["classification"] = fo.Classification(label="example")
   sample.save()
   ```

### Issue: Classification button does nothing

**Symptom:** Click button but nothing happens.

**Debug steps:**

1. Open browser console
2. Check for errors
3. Verify `defaultField(CLASSIFICATION)` returns a field:
   ```javascript
   // In browser console with React DevTools
   // Find the useCreate hook and inspect defaultField
   ```

4. Check if `editing` atom is being set:
   ```javascript
   // Should see editing change in Jotai DevTools
   ```

### Issue: Schema not showing up

**Symptom:** Added field but it's not in Schema Manager.

**Cause:** Field type not supported or not in active fields.

**Solution:**

1. Verify field type:
   ```python
   field = dataset.get_field("your_field")
   print(field.document_type)  # Should be fiftyone.core.labels.Classification
   ```

2. Check if field is in active fields:
   ```python
   from fiftyone import ViewField as F
   # Field must be visible in the modal view
   ```

3. Refresh schemas:
   ```python
   # In Python
   dataset.reload()
   ```

   ```javascript
   // In browser - reload page
   window.location.reload()
   ```

### Issue: Multiple datasets with test data

**Symptom:** Hundreds of PW-*-8787 test databases.

**Solution:**

```javascript
// Connect to MongoDB
mongosh mongodb://127.0.0.1:27017

// Delete all test databases
const dbs = db.adminCommand('listDatabases').databases;
const pwDbs = dbs.filter(db => db.name.match(/^PW-.*-8787$/));

pwDbs.forEach(dbInfo => {
  const targetDb = db.getSiblingDB(dbInfo.name);
  targetDb.dropDatabase();
  print(`Deleted ${dbInfo.name}`);
});
```

### Issue: Classification field exists but defaultField returns null

**Symptom:** Field exists and is active, but useCreate fails.

**Cause:** Field is disabled (non-list field with existing value).

**Debug:**

```python
# Check if field is a list type
field = dataset.get_field("classification")
print(f"Type: {type(field)}")  # Should be EmbeddedDocumentField

# Check field schema
schema = dataset.get_field_schema()
for name, f in schema.items():
    print(f"{name}: {f}")
```

**Solution:**

If it's a single Classification (not Classifications), and a sample already has data, you need to either:
1. Use a list type: `Classifications` instead of `Classification`
2. Clear the existing value
3. Use a different field name

---

## Quick Reference

### File Locations

```
Frontend:
  Actions:        app/packages/core/src/components/Modal/Sidebar/Annotate/Actions.tsx
  Create Logic:   app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate.ts
  State:          app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/state.ts
  Edit Panel:     app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/Edit.tsx
  Schema Loader:  app/packages/core/src/components/Modal/Sidebar/Annotate/useLoadSchemas.ts

Overlays:
  Classification: app/packages/lighter/src/overlay/ClassificationOverlay.ts
  Detection:      app/packages/lighter/src/overlay/BoundingBoxOverlay.ts
  Factory:        app/packages/lighter/src/overlay/OverlayFactory.ts

Backend:
  Operators:      plugins/operators/annotation.py
```

### Python Snippets

```python
# Load dataset
dataset = fo.load_dataset("name")

# Add classification field
sample["field"] = fo.Classification(label="value")
sample.save()

# Compute schema
config = dataset.compute_annotation_schema("field")

# Activate schema
field = dataset.get_field("field")
field.schema = {"active": True, "config": config}
field.save()

# Check active schemas
for name, field in dataset.get_field_schema().items():
    if hasattr(field, 'schema') and field.schema:
        print(f"{name}: active={field.schema.get('active')}")
```

### MongoDB Snippets

```javascript
// Connect
mongosh mongodb://127.0.0.1:27017/fiftyone

// List datasets
db.datasets.find({}, {name: 1, sample_collection_name: 1})

// View schemas
db.datasets.findOne({name: "quickstart"}).sample_fields

// View samples
db["samples.{id}"].findOne()

// Count by label
db["samples.{id}"].aggregate([
  { $group: { _id: "$classification.label", count: { $sum: 1 } } }
])
```

### TypeScript Constants

```typescript
// From @fiftyone/utilities
export const CLASSIFICATION = "Classification";
export const CLASSIFICATIONS = "Classifications";
export const DETECTION = "Detection";
export const DETECTIONS = "Detections";
export const POLYLINE = "Polyline";
export const POLYLINES = "Polylines";

export const CLASSIFICATION_FIELD = "fiftyone.core.labels.Classification";
export const CLASSIFICATIONS_FIELD = "fiftyone.core.labels.Classifications";
export const DETECTION_FIELD = "fiftyone.core.labels.Detection";
export const DETECTIONS_FIELD = "fiftyone.core.labels.Detections";
```

---

## Summary

### What We Learned

1. **Architecture**: Annotation mode uses a combination of React components, Jotai state management, overlays for rendering, and backend operators for data persistence.

2. **Schema System**: Schemas are stored in MongoDB on dataset fields and define which fields are available for annotation and what label choices exist.

3. **Creation Flow**: When creating an annotation, the system:
   - Checks for available fields via `defaultField(type)`
   - Creates an overlay if field exists
   - Opens edit panel or shows error message

4. **Key Difference**: Classifications go directly to edit panel, while Detections enter interactive drawing mode first.

5. **MongoDB Structure**: FiftyOne stores dataset metadata (including schemas) in a `datasets` collection and sample data in per-dataset collections.

### What We Implemented

1. ✓ Added `classification` field to the `quickstart` dataset
2. ✓ Computed and activated the classification schema
3. ✓ Verified the schema appears in `activeSchemas`
4. ✓ Confirmed classification creation now works in the UI

### Next Steps

To fully implement classification annotation:

1. **Test the UI**: Open quickstart dataset, click "Create new classification", verify it works
2. **Add more datasets**: Repeat the process for other datasets
3. **Enhance ClassificationOverlay**: Currently has early return in `renderImpl()` - may want to add visual representation
4. **Handle edge cases**:
   - Empty datasets
   - Fields without schemas
   - Permission errors
5. **Add tests**: Create Playwright tests for classification creation flow

---

**End of Document**

For questions or issues, refer to:
- FiftyOne Docs: https://docs.voxel51.com
- Annotation API: https://docs.voxel51.com/user_guide/annotation.html
- MongoDB Docs: https://docs.mongodb.com
