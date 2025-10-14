.. _val_configure_run:

Step 2: Configure Your VAL Run
===============================

.. default-role:: code

With your dataset and orchestrator ready, it's time to configure your Verified Auto-Labeling run. This step guides you through model selection, sample targeting, class configuration, and inference settings.

.. contents:: In this section
   :local:
   :depth: 2

Open the Auto Labeling Panel
-----------------------------

1. Open your dataset in the FiftyOne App
2. Click the **Panels** button (□ icon) in the right sidebar
3. Select **Auto Labeling** from the panels list
4. The Auto Labeling panel opens, showing any previous runs

Start a New VAL Run
-------------------

Click the **Auto Label** button (gradient orange/purple button) to begin configuration.

.. note::
   If you don't see the Auto Label button, verify you have edit permissions on the dataset.

Configuration Wizard
--------------------

The VAL configuration wizard guides you through four steps:

**Step 1: Select Model**

Browse and select a model for your labeling task.

*Available Model Categories*:

- **Detection Models**: YOLOv8, DINO, Grounding DINO, Faster R-CNN
- **Classification Models**: CLIP, ResNet, EfficientNet, ViT
- **Segmentation Models**: SAM, SAM2, Mask R-CNN, DeepLab

*Model Selection Tips*:

- **YOLOv8**: Fast, accurate, good for common objects. Start here for detection.
- **Grounding DINO**: Zero-shot detection with text prompts. Great for custom classes.
- **CLIP**: Zero-shot classification. Ideal for arbitrary categories.
- **SAM2**: State-of-the-art segmentation. Works with prompts or auto-segmentation.

*Model Details Display*:

Each model shows:
- Description and key features
- Vocabulary type (zero-shot or fixed)
- Model size and performance characteristics
- Supported input types

Click your chosen model, then **Next**.

**Step 2: Select Sample Target**

Choose which samples to label:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Target
     - Description
   * - **Dataset**
     - Label all samples in the dataset
   * - **Current View**
     - Label only filtered/sorted samples currently visible
   * - **Selected Samples**
     - Label only manually selected samples

The interface shows the sample count for each option.

*When to use each target*:

- **Dataset**: Initial full-dataset labeling
- **Current View**: Re-label filtered subsets, specific data slices
- **Selected Samples**: Cherry-pick specific samples, test runs

Click your target, then **Next**.

**Step 3: Configure Classes**

Define which classes the model should predict.

*For Zero-Shot Models*:

Enter custom class names:

.. code-block:: text

   car, truck, bus, motorcycle, bicycle, person, dog, cat

Or use suggested classes if available.

*For Fixed-Vocabulary Models*:

- Browse model's predefined class list
- Use search to filter classes
- Select relevant classes (e.g., vehicle types from COCO's 80 classes)

*Class Selection Tips*:

- **Be specific**: "sedan" vs. "car" for fine-grained needs
- **Avoid overlaps**: Don't use both "vehicle" and "car"
- **Start broad**: Can always filter to specific classes later
- **Consider hierarchy**: Some models understand class relationships

Click **Next** after selecting classes.

**Step 4: Configure Settings**

Final configuration:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Setting
     - Description
   * - **Label Field**
     - Name for new field storing predictions (e.g., "auto_detections")
   * - **Min Confidence**
     - Confidence threshold (0.0-1.0). Lower = more predictions, more false positives
   * - **Orchestrator**
     - Select configured GPU orchestrator
   * - **Mask Output Path**
     - (Segmentation only) Directory for mask files
   * - **Advanced Options**
     - Model-specific parameters if available

*Confidence Threshold Guidance*:

.. list-table::
   :widths: 20 40 40
   :header-rows: 1

   * - Threshold
     - Behavior
     - When to Use
   * - **0.1-0.3**
     - Many predictions, high recall, more false positives
     - Initial exploration, rare object detection
   * - **0.3-0.5**
     - Balanced, moderate false positives
     - Standard first-pass labeling
   * - **0.5-0.7**
     - Fewer predictions, higher precision
     - High-quality datasets, common objects
   * - **0.7-1.0**
     - Very conservative, minimal false positives
     - Automatic approval workflows

.. tip::
   **Start at 0.3** for your first run. You can adjust dynamically during review using the confidence slider.

Review and Launch
-----------------

**Configuration Summary**

The wizard displays your final configuration:

.. code-block:: text

   Model: yolov8m-640
   Target: Current View (1,250 samples)
   Classes: car, truck, person, bicycle (4 classes)
   Label Field: auto_detections
   Min Confidence: 0.3
   Orchestrator: GPU Inference Orchestrator

**Launch the Run**

1. Review settings carefully
2. Click **Generate Labels**
3. Confirm in the dialog
4. Run begins executing

Monitoring Your Run
-------------------

**Loading View**

After launch, the panel switches to a loading view showing:

- Model name
- Number of samples being processed
- Real-time progress updates
- Estimated time remaining (if available)

**Run Status Indicators**:

- **Generating** (animated): Run in progress
- **In Review**: Completed, ready for review
- **Approved**: Finalized and added to dataset
- **Error**: Run failed (click for details)

**Access Run Details**

Navigate to **Runs** page (top navigation):

1. Find your run in the list
2. Click for detailed view showing:
   - Configuration parameters
   - Start/end timestamps
   - Operator Run ID
   - Status and progress

**View Logs**

From the Runs page:

1. Click **•••** menu next to your run
2. Select **View Logs**
3. Real-time log output appears
4. Monitor for:
   - Model loading messages
   - Sample processing progress
   - Warning or error messages
   - Completion confirmation

Common Configuration Mistakes
------------------------------

**❌ Wrong orchestrator selected**
- Ensure GPU orchestrator is active
- Verify sufficient resources allocated

**❌ Confidence threshold too high**
- Models may produce zero predictions
- Start lower (0.2-0.3) and increase if needed

**❌ Incompatible classes for fixed-vocabulary models**
- Only use classes from model's vocabulary
- Check model documentation for supported classes

**❌ Label field name conflicts**
- Don't use existing field names
- Choose descriptive, unique names

**❌ Sample target mismatch**
- "Current View" uses active filters
- Verify correct samples are targeted

Troubleshooting
---------------

**Run fails immediately**

Check:
- Orchestrator status (must be "Active")
- Image file accessibility from orchestrator
- Sufficient GPU memory for model
- Valid class names for model type

**Run stuck at 0% progress**

Possible causes:
- Orchestrator starting up (wait 1-2 minutes)
- Model downloading (first run with model)
- Resource contention (check orchestrator logs)

**Out of memory errors**

Solutions:
- Use smaller model variant (e.g., YOLOv8n instead of YOLOv8x)
- Reduce image resolution (resize images)
- Increase orchestrator memory allocation
- Process in smaller batches (use "Selected Samples")

Next Steps
----------

Your VAL run is now executing! Depending on dataset size and model complexity, this may take minutes to hours.

When complete, the run status changes to **In Review**, and you can begin analyzing and reviewing predictions.

Click **Next** to learn about :ref:`Step 3: Analyze Predictions <val_analyze_results>`.

.. note::
   You can launch multiple VAL runs in parallel with different configurations to compare models or settings. Each run operates independently.
