.. _val_configure_run:

Step 2: Configure Your VAL Run
===============================

.. default-role:: code

With your dataset and DO(s) ready, it's time to configure your Verified Auto-Labeling run. This step guides you through sample and model selection, class configuration, target label fields, and setting a minimum confidence threshold.

.. contents:: In this section
   :local:
   :depth: 2

Open and configure Auto Labeling
-----------------------------

1. Click into your FiftyOne dataset. Above the sample grid, select **New panel > Auto Labeling**. 

.. tip::
  Click the "Split horizontally" button (looks like two vertical bars) in the toolar to put the auto labeling configuration side by side with your dataset.

2. In the Auto Labeling panel, click **Auto Label**. This enters you into the main configuration pane to where you can select your target sample set, foundation model used for labeling, classes to label, and minimum confidence threshold.

3. Expand the **Target** dropdown. We are going to assign labels to every sample in the dataset, so select the **All samples** radio button.

4. Expand the **Detection** dropdown. Select the **Detection** tile to perform object detection.

5. Under model type, choose **Zero-shot**. We also have the option of choosing a fixed vocabulary model with predefined classes.

6. Open the zero-shot model dropdown, and select **YOLO World** as the chosen detection model.

7. Expand the **Define zero-shot classes** dropdown.

8. Enter the following comma-separated classes:
    - car
    - bus
    - person
    - bicycle
    - traffic sign

9. Expand the **Settings** dropdown.

10. For **Label field**, type **yolow-detections**.

11. For **Minimum confidence in results**, type **0.3**. 

.. tip::
  For auto labeling, a low-medium confidence threshold often maxmizes downstream model accuracy due to increased recall. See this `article <https://voxel51.com/blog/zero-shot-auto-labeling-rivals-human-performance>` for more details. 

12. For **Run name**, type **yolow-detections-run**.

13. Click **Auto Label**, then click **Schedule** for one of your delegated operators.

Start a New VAL Run
-------------------


Configuration Panel
--------------------

Review and Launch
-----------------

Monitoring Your Run
-------------------

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

Next Steps
----------

Your VAL run is now executing! Depending on dataset size and model complexity, this may take minutes to hours.

When complete, the run status changes to **In Review**, and you can begin analyzing and reviewing predictions.

Click **Next** to learn about :ref:`Step 3: Analyze Predictions <val_analyze_results>`.

.. note::
   You can launch multiple VAL runs in parallel with different configurations to compare models or settings. Each run operates independently.
