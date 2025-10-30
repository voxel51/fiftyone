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

Start by clicking into your FiftyOne dataset. Above the sample grid, select **New panel > Auto Labeling**. 

.. tip::
  Click the "Split horizontally" button (looks like two vertical bars) in the toolar to put the auto labeling configuration side by side with your dataset.

In the Auto Labeling panel, click **Auto Label**. This enters you into the main configuration pane to where you can select your target sample set, foundation model used for labeling, classes to label, and minimum confidence threshold.

**<image placeholder>**

Now expand the **Target** dropdown. We are going to assign labels to every sample in the dataset, so additionally select the **All samples** radio button.

**<image placeholder>**

Expand the **Detection** dropdown. Select the **Detection** tile to perform object detection. Then under model type, choose **Zero-shot**. We also have the option of choosing a fixed vocabulary model with predefined classes. Open the zero-shot model dropdown, and select **YOLO World** as the chosen detection model.

**<image placeholder>**

Next, expand the **Define zero-shot classes** dropdown. Enter the following comma-separated classes:
    - car
    - bus
    - person
    - bicycle
    - traffic sign

Finally, expand the **Settings** dropdown.
    - For **Label field**, type **yolow-detections**.
    - For **Minimum confidence in results**, type **0.3**. 
    - For **Run name**, type **yolow-detections-run**.

.. tip::
  For auto labeling, a low-medium confidence threshold often maxmizes downstream model accuracy due to increased recall. See this `article <https://voxel51.com/blog/zero-shot-auto-labeling-rivals-human-performance>`_ for more details. 


Now click **Auto Label**, then click **Schedule** for one of your delegated operators.

Monitor the VAL run
-------------------

FiftyOne has now begun running the VAL operation as a background job. To view the job's progress, you can click **View Status** from the Auto Labeling panel, or the **Runs** tab and then click into your running job where you'll see the job's progress as well as your configuration parameters as inputs.

Next Steps
----------

Your VAL run is now executing! When complete, the run status changes to **In Review**, and you can begin analyzing and reviewing predictions.

Click **Next** to learn about :ref:`Step 3: Analyze Label Predictions <val_analyze_results>`.

.. note::
   You can launch multiple VAL runs in parallel with different configurations to compare models or settings. Each run operates independently.
