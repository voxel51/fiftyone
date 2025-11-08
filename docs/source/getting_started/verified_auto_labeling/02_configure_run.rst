.. _val_configure_run:

Step 2: Configure Your VAL Run
===============================

.. default-role:: code

With your dataset and DO(s) ready, it's time to configure your Verified Auto-Labeling run. This step guides you through sample and model selection, class configuration, target label fields, and setting a minimum confidence threshold.

.. contents:: In this section
   :local:
   :depth: 2

Open and Configure Auto Labeling
-----------------------------

Start by clicking into your FiftyOne dataset. Above the sample grid, select **New panel > Auto Labeling**. 

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_panel.webp
   :alt: VAL Panel selection
   :align: center
   :width: 75%

.. tip::
  Click the "Split horizontally" button (looks like two vertical bars) in the toolbar to put the auto labeling configuration side by side with your dataset.

In the Auto Labeling panel, click **Auto Label**. This enters you into the main configuration pane to where you can select your target sample set, foundation model used for labeling, classes to label, and minimum confidence threshold.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_panel_intro.webp
   :alt: VAL Panel intro
   :align: center
   :width: 75%

Now expand the **Target** dropdown. We are going to assign labels to every sample in the dataset, so additionally select the **All samples** radio button.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_target.webp
   :alt: VAL choose target
   :align: center
   :width: 75%

Expand the **Detection** dropdown. Select the **Detection** tile to perform object detection. Then under model type, choose **Zero-shot**. We also have the option of choosing a fixed vocabulary model with predefined classes. Open the zero-shot model dropdown, and select **YOLO World** as the chosen detection model.

For the model **Size**, choose **Medium** to balance speed and performance.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_model.webp
   :alt: VAL choose model
   :align: center
   :width: 75%

Next, expand the **Define zero-shot classes** dropdown. Enter the following comma-separated classes:
    - car
    - bus
    - person
    - bicycle
    - traffic sign

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_define_classes.webp
   :alt: VAL run define classes
   :align: center
   :width: 75%

Finally, expand the **Settings** dropdown.
    - For **Label field**, type **yolow_detections**.
    - For **Minimum confidence in results**, type **0.3**. 
    - For **Run name**, type **yolow_detections_run**.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_settings.webp
   :alt: VAL run settings
   :align: center
   :width: 75%

.. tip::
  For auto labeling, a low-medium confidence threshold often maxmizes downstream model accuracy due to increased recall. See this `article <https://voxel51.com/blog/zero-shot-auto-labeling-rivals-human-performance>`_ for more details. 


Now click **Auto Label**, then click **Schedule** for one of your delegated operators. Your auto labeling job will then kick off in the background.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_start_confirmation.webp
   :alt: VAL run start confirmation message
   :align: center
   :width: 75%

Monitor the VAL run
-------------------

FiftyOne has now begun running the VAL operation as a background job. To view the job's progress, you can click **View Status** from the Auto Labeling panel, or the **Runs** tab and then click into your running job where you'll see the job's progress as well as your configuration parameters as inputs. In the job run, also note the ability to view and download the job log, re-run the job, and if necessarily terminate/cancel any stuck jobs.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_run_log.webp
   :alt: VAL run log
   :align: center
   :width: 75%

Next Steps
----------

Your VAL run is now executing! When complete, the run status changes to **Complete**, and you can then return to the Auto Labeling panel to begin analyzing and reviewing predictions.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook1/val_in_review_card.webp
   :alt: VAL panel in review
   :align: center
   :width: 75%


Click **Next** to learn about :ref:`Step 3: Analyze Label Predictions <val_analyze_results>`.

.. note::
   You can launch multiple VAL runs in parallel with different configurations to compare models or settings. Each run operates independently.
