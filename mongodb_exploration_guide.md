# ========================== Classifications in Lighter

# Classifications and Detections

       Summary: Annotation Mode - Classification and Detection Creation Files

       Based on my thorough search of the FiftyOne codebase, here are the most relevant files for understanding and implementing the "Create new classification" functionality in annotation mode:

       Core Annotation Components

       1. Actions Toolbar (The Buttons)

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/core/src/components/Modal/Sidebar/Annotate/Actions.tsx

       Description: This is the main file containing the UI buttons for annotation mode. It includes:
       - Classification() component - "Create new classification" button (left button)
       - Detection() component - "Create new detection" button (right button)
       - Undo() and Redo() buttons
       - ThreeDPolylines() for 3D annotation mode
       - Uses styled components (Square, Round, RoundButton classes)
       - Both buttons use the useCreate hook to handle creation logic

       Key Code Flow:
       const Classification = () => {
         const create = useCreate(CLASSIFICATION);
         return (
           <Tooltip placement="top-center" text="Create new classification">
             <Square onClick={create}>
               {/* SVG icon */}
             </Square>
           </Tooltip>
         );
       };

       ---
       2. Create Hook (Business Logic)

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate.ts

       Description: Core logic for creating new annotations. When a user clicks either button, this hook:
       - Generates a unique object ID for the annotation
       - Creates an overlay using the overlay factory
       - For Classification: Creates a ClassificationOverlay
       - For Detection: Creates a BoundingBoxOverlay and enters interactive mode for drawing
       - Sets the created annotation as "editing" in state
       - Handles the field selection for where to store the annotation

       Key Operations:
       - Creates overlay with overlayFactory.create()
       - Adds overlay to scene with addOverlay()
       - For detections: Creates InteractiveDetectionHandler to handle mouse drawing
       - Sets editing state so the Edit panel opens

       ---
       State Management

       3. Edit State Management

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/state.ts

       Description: Jotai atoms managing the annotation editing state:
       - editing - Which annotation is currently being edited
       - currentType - Type of annotation (CLASSIFICATION, DETECTION, POLYLINE)
       - currentField - Which field the annotation belongs to
       - currentData - The actual data of the annotation being edited
       - defaultField() - Determines the default field for a new annotation type
       - savedLabel - Tracks the previously saved state for undo/discard detection

       Important Atoms:
       - isNew - Whether this is a newly created annotation
       - hasChanges - Whether there are unsaved changes
       - disabledFields - Fields that can't accept new items (already have content for single-value fields)

       ---
       Overlay Implementations

       4. Classification Overlay

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/lighter/src/overlay/ClassificationOverlay.ts

       Description: The overlay class for rendering classification annotations:
       - Implements Selectable interface for selection support
       - Renders classification text (and optionally confidence percentage)
       - Handles selection styling with dashed borders
       - Shows text with background for readability
       - Note: Current renderImpl() returns early (lines 42-44), so classifications don't visually render yet

       ---
       5. Bounding Box (Detection) Overlay

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/lighter/src/overlay/BoundingBoxOverlay.ts

       Description: The overlay class for rendering detection/bounding box annotations:
       - Implements Movable, Selectable, BoundedOverlay, Spatial, Hoverable interfaces
       - Manages bounds (absolute and relative coordinates)
       - Handles dragging, resizing, and interactive drawing
       - Renders rectangle with stroke, labels, and selection handles
       - Manages move state (DRAGGING, SETTING, RESIZING, etc.)
       - Complex interaction handler for multi-directional resizing

       ---
       6. Overlay Factory

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/lighter/src/overlay/OverlayFactory.ts

       Description: Factory pattern for creating overlay instances:
       - Pre-registers built-in overlays: "bounding-box", "classification", "image"
       - Allows custom overlay registration
       - Type-safe overlay creation
       - Used by useCreate hook to instantiate new annotations

       ---
       Interaction Handling

       7. Interactive Detection Handler

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/lighter/src/interaction/InteractiveDetectionHandler.ts

       Description: Handles mouse interactions for drawing new detections:
       - Implements InteractionHandler interface
       - Sets cursor to "crosshair" during drawing
       - Manages pointer down/up/move events
       - Tracks start point and current bounds
       - Updates bounding box as user drags
       - Validates minimum pixel size (MIN_PIXELS = 2)
       - Toggles selection when drawing completes

       Workflow:
       1. onPointerDown - Initializes drawing at click point
       2. onMove/onDrag - Updates bounds as mouse moves
       3. onPointerUp - Completes drawing if size is valid

       ---
       UI Components

       8. Edit Panel

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/Edit.tsx

       Description: The main editing panel that opens when creating/editing an annotation:
       - Shows header, content area, and footer
       - Renders different fields based on annotation type
       - For DETECTION: Shows Position component
       - For POLYLINE: Shows PolylineDetails component
       - Shows AnnotationSchema for label configuration
       - Handles save/discard with confirmation

       ---
       9. Main Annotate Component

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/core/src/components/Modal/Sidebar/Annotate/Annotate.tsx

       Description: Container component for the entire annotation UI:
       - Conditionally renders Actions toolbar or Edit panel
       - Renders the annotation list/sidebar
       - Handles loading state
       - Shows import/schema management UI

       ---
       Related Utility Files

       10. Type Constants

       File: /Users/gavin/Projects/temp/fiftyone/app/packages/utilities/src/index.ts

       Description: Defines constants used throughout:
       export const CLASSIFICATION = "Classification";
       export const CLASSIFICATIONS = "Classifications";
       export const DETECTION = "Detection";
       export const DETECTIONS = "Detections";
       export const POLYLINE = "Polyline";
       export const POLYLINES = "Polylines";

       ---
       Directory Structure

       /Users/gavin/Projects/temp/fiftyone/app/packages/
       ├── core/src/components/Modal/Sidebar/Annotate/
       │   ├── Actions.tsx                          [Buttons UI]
       │   ├── Annotate.tsx                         [Main container]
       │   ├── Edit/
       │   │   ├── useCreate.ts                     [Create logic]
       │   │   ├── state.ts                         [Edit state]
       │   │   ├── Edit.tsx                         [Edit panel]
       │   │   ├── Field.tsx                        [Field selector]
       │   │   ├── Position.tsx                     [Detection position]
       │   │   ├── AnnotationSchema.tsx             [Label fields]
       │   │   ├── Header.tsx                       [Edit header]
       │   │   ├── Footer.tsx                       [Save/Cancel]
       │   │   └── ...
       │   ├── useLabels.ts                         [Fetch labels]
       │   ├── useEntries.ts                        [Build entry tree]
       │   └── ...
       └── lighter/src/
           ├── overlay/
           │   ├── ClassificationOverlay.ts         [Classification render]
           │   ├── BoundingBoxOverlay.ts            [Detection render]
           │   ├── OverlayFactory.ts                [Overlay creation]
           │   └── BaseOverlay.ts                   [Base class]
           └── interaction/
               └── InteractiveDetectionHandler.ts   [Detection drawing]

       ---
       Key Data Flow for Classification Creation

       1. User clicks "Create new classification" button in Actions.tsx
       2. useCreate(CLASSIFICATION) hook is triggered
       3. useCreateAnnotationLabel generates unique ID and creates overlay
       4. overlayFactory.create("classification", { field, id, label }) instantiates ClassificationOverlay
       5. Overlay is added to scene
       6. editing state is set to trigger Edit panel render
       7. Edit panel (Edit.tsx) opens showing the schema fields
       8. User fills in classification data
       9. Save triggers useSave which persists the data

       ---
       Key Differences: Classification vs Detection

       | Aspect       | Classification        | Detection                    |
       |--------------|-----------------------|------------------------------|
       | Overlay Type | ClassificationOverlay | BoundingBoxOverlay           |
       | Interaction  | Direct to edit panel  | Interactive drawing required |
       | Handler      | None                  | InteractiveDetectionHandler  |
       | Scene Mode   | Normal                | Interactive (mouse drawing)  |
       | Fields       | Text/choice labels    | Bounding box + labels        |
       | Position     | None                  | Requires Position component  |

# Where 'editing' atom is set

Core Annotation Files (2D)

1. app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/useCreate.ts
   (lines 71, 77-84)
    - Sets editing when creating new annotations
    - Sets to atom with label data if field exists, or to string type if no
      field available

2. app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/useExit.ts
   (lines 18, 61, 69, 95)
    - Sets editing to null when exiting edit mode
    - Called when user cancels or finishes editing

3. app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/AddSchema.tsx
   (lines 39, 63)
    - Sets editing to null when clicking "Add schema" button

4. app/packages/core/src/components/Modal/Sidebar/Annotate/LabelEntry.tsx
   (lines 59, 105)
    - Sets editing to the label atom when clicking on an existing label in the
      list

5. app/packages/core/src/components/Modal/Sidebar/Annotate/useFocus.ts
   (line 28)
    - Sets editing directly using store when focusing on a label

6. app/packages/core/src/components/Modal/Sidebar/Annotate/Edit/state.ts
   (line 209)
    - Sets editing to null in the deleteValue atom when deleting a label

3D Annotation Files (Polylines)

7. app/packages/looker-3d/src/annotation/useSetEditingToNewPolyline.tsx (lines
   26, 43, 61, 109)
    - Sets editing when creating new polylines in 3D
    - Resets to null when clearing

8. app/packages/looker-3d/src/annotation/useSetEditingToExistingPolyline.tsx
   (lines 22-23, 35, 71)
    - Sets editing when editing existing polylines in 3D
    - Uses resetEditing to clear

9. app/packages/looker-3d/src/annotation/annotation-toolbar/useAnnotationActions.tsx
   (lines 64, 255)
    - Sets editing to null when clearing annotations in 3D toolbar

10. app/packages/looker-3d/src/labels/index.tsx (lines 91, 160)
    - Calls setEditingToExistingPolyline helper (indirectly sets editing)

Summary by Action

- Create new annotation: useCreate.ts:77
- Edit existing annotation: LabelEntry.tsx:105, useFocus.ts:28
- Exit/Cancel editing: useExit.ts:61,69,95, AddSchema.tsx:63
- Delete annotation: state.ts:209
- 3D polyline operations: Various files in looker-3d/src/annotation/

# MongoDB Exploration Guide

Connection: mongosh mongodb://127.0.0.1:27017/fiftyone

Key Collections: - datasets : Dataset metadata & schemas - samples.{id} :
Sample data for each dataset

## Useful Commands:

1. List all datasets: db.datasets.find({}, {name: 1, sample_collection_name:
   1})

2. View dataset schema: db.datasets.findOne({name:
   "histograms-108u6ol"}).sample_fields

3. View a sample document: db["samples.692eeca3964abaf5abc8154c"].findOne()

4. Query classification data: db["samples.692eeca3964abaf5abc8154c"].find({},
   {"classification.label": 1})

5. Count samples by classification:
   db["samples.692eeca3964abaf5abc8154c"].aggregate([ { $group: { _id:
   "$classification.label", count: { $sum: 1 } } } ])

6. View classification schema: db.datasets.findOne( {name:
   "histograms-108u6ol"}, {"sample_fields.$": 1} )

7. Update schema (activate a field): db.datasets.updateOne( {name:
   "histograms-108u6ol", "sample_fields.name": "classification"},
   {$set: {"sample_fields.$.schema.active": true}} )

Dataset -> Collection Mapping: histograms-108u6ol ->
samples.692eeca3964abaf5abc8154c operators-prompt-3ab3adt ->
samples.692eeca24eba7517a81e8754 python-panels-grid-awvepu7 ->
samples.692eeca21bb7f6048fa79473

# Adding 'Classification'

````python
      import fiftyone as fo

      # Load the quickstart dataset
      dataset = fo.load_dataset("quickstart")

      print(f"Dataset: {dataset.name}")
      print(f"Samples: {len(dataset)}")

      # Check if there are any existing classification-like fields
      print("\nExisting fields:")
      for field_name, field in dataset.get_field_schema().items():
          field_type = str(type(field))
          if hasattr(field, 'document_type'):
              doc_type = str(field.document_type).split('.')[-1]
              print(f"  {field_name}: {doc_type}")
          elif 'Field' in field_type:
              print(f"  {field_name}: {field_type.split('.')[-1]}")

      # Let's add a classification field by adding some sample data
      # We'll create classifications based on the ground truth detections
      print("\nAdding classification field...")

      for sample in dataset.iter_samples(progress=True):
          # Get the most common label from ground_truth detections
          if sample.ground_truth and sample.ground_truth.detections:
              # Just use the first detection's label for simplicity
              label = sample.ground_truth.detections[0].label
              sample["classification"] = fo.Classification(label=label)
          else:
              sample["classification"] = fo.Classification(label="unknown")
          sample.save()

      print(f"\n✓ Added 'classification' field to {len(dataset)} samples")

      # Now compute and activate the schema
      print("\nComputing schema...")
      schema_config = dataset.compute_annotation_schema("classification", scan_samples=True)

      print(f"✓ Schema computed with {len(schema_config.get('classes', []))} classes")

      # Save and activate the schema
      field = dataset.get_field("classification")
      field.schema = {
          "active": True,
          "config": schema_config
      }
      field.save()

      print("✓ Schema activated!")
      print(f"\nClasses found: {schema_config.get('classes', [])}")
			```


	How it works
	------------

  The activeSchemas atom is automatically populated from the backend:

  1. Backend: The get_annotation_schemas operator (in plugins/operators/annotation.py:32-48) fetches schemas from dataset fields
  2. Frontend: useLoadSchemas.ts calls this operator and populates the schemas atom
  3. Filtering: activeSchemas atom filters to only show schemas where schema.active === true

  Now when you:
  - Open the quickstart dataset in FiftyOne
  - Click "Create new classification"
  - The classification field will be available in the dropdown
  - You can create and edit classifications!

  Summary: How to add a schema for any field type

  # 1. Add field data to your dataset
  sample["your_field_name"] = fo.Classification(label="example")
  sample.save()

  # 2. Compute the schema
  schema_config = dataset.compute_annotation_schema("your_field_name")

  # 3. Activate it
  field = dataset.get_field("your_field_name")
  field.schema = {"active": True, "config": schema_config}
  field.save()
````

# Converting `classification` to `classifications`

```python
	import fiftyone as fo

	dataset = fo.load_dataset("quickstart")

	print("Converting 'classification' to 'classifications' (plural)...")

	# Convert each sample's classification to a classifications list
	for sample in dataset.iter_samples(progress=True):
			if sample["classification"]:
					# Move singular classification to a list
					old_classification = sample["classification"]
					sample["classifications"] = fo.Classifications(
							classifications=[
									fo.Classification(
											label=old_classification.label,
											confidence=old_classification.confidence
									)
							]
					)
			else:
					sample["classifications"] = fo.Classifications(classifications=[])

			sample.save()

	print("\n✓ Converted all samples")

	# Compute and activate schema for the new field
	print("\nComputing schema for 'classifications'...")
	schema_config = dataset.compute_annotation_schema("classifications", scan_samples=True)

	field = dataset.get_field("classifications")
	field.schema = {"active": True, "config": schema_config}
	field.save()

	print(f"✓ Schema activated with {len(schema_config['classes'])} classes")

	# Optional: Deactivate the old singular field
	print("\nDeactivating old 'classification' field...")
	old_field = dataset.get_field("classification")
	if old_field.schema:
			old_field.schema["active"] = False
			old_field.save()
			print("✓ Old field deactivated")

	# Verify
	print("\nActive schemas:")
	for field_name, field in dataset.get_field_schema().items():
			if hasattr(field, 'schema') and field.schema and field.schema.get('active'):
					doc_type = str(field.document_type).split('.')[-1] if hasattr(field, 'document_type') else "N/A"
					print(f"  ✓ {field_name} ({doc_type})")
```

