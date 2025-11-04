.. _val_analyze_results:

Step 3: Analyze and Approve Predictions
============================

.. default-role:: code

Your VAL run has completed, and label predictions are ready for review. You will now systematically assess auto-generated labels using FiftyOne's exploration tools.

.. contents:: In this section
   :local:
   :depth: 2

Review interface
----------------

When your run status changes to **In Review**, the Auto Labeling panel displays an interface with two tabs: **Review** and **Approval**. Here you can batch select labels for approval.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_ui.webp
   :alt: VAL review interface
   :align: center
   :width: 100%

Note the confidence slider and the label table in the Auto Labeling panel. The confidence slider lets you show only samples containing labels within the minimum and maximum thresholds specified. The lable table shows you the count for each predicted class across you samples, along with the average confidence for that class. Selecting an entry in the table only shows samples with that predicted class.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_class_filter.webp
   :alt: VAL review panel class filtering
   :align: center
   :width: 100%

Also notice that the default view shows each sample once with all predicted detections on the sample. When evaluating object detections, it can be more useful to analyze and approve each label as individual samples. This can be done through patches views, described below.

Compute and view patches
------------------------

The FiftyOne App provides a patches view button that allows you to take any Detections field in your dataset and visualize each object as an individual patch in the image grid.

In the toolbar above the sample grid, select **Patches > Labels > yolow_detections**. You'll notice the sample grid will now show one image per bounding box label.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_patches_view.webp
   :alt: Object patches of autolabels
   :align: center
   :width: 100%

Batch high-confidence samples for approval
------------------------------------------

From here we can then try to find high-confidence true positives. Adjust the slider so the minimum confidence threshold is **70%**. 

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_confidence_slider.webp
   :alt: Auto labeling confidence slider
   :align: center
   :width: 100%

Then, in the filtered sample grid, select **10** samples that you visually recognize as having correct label predictions for **car**.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_patch_samples_select.webp
   :alt: Select patch samples
   :align: center
   :width: 100%

Finally, in the Auto Labeling panel, click **Add 10 labels for approval**. 

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_review_and_approve.webp
   :alt: Review and approval selected labels
   :align: center
   :width: 100%

Those 10 labels are now available in the **Approval** tab. You (or a team member) can later approve this labels. Leave them as marked for approval for now (don't give the final approval yet).

.. image:: https://cdn.voxel51.com/getting_started_val/notebook3/val_labels_ready_approval.webp
   :alt: Review labels marked for approval
   :align: center
   :width: 100%

Next Steps
----------

You've now explored your auto labeled samples and marked some for approval. In the next section, you will compute and visualize patch embeddings to root out false negatives and mark samples in need of human correction.

Click **Next** to proceed to :ref:`Step 4: Visualize embeddings <val_visualize_embeddings>`.
