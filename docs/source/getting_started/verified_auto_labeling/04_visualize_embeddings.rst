.. _val_visualize_embeddings:

Step 4: Assess Labels with Embeddings
====================================

.. default-role:: code

The sample grid is useful for visually identifying true and false positives. However, identifying false positives in bulk and false negatives at all can be difficult. Using FiftyOne's patch embeddings can assist in identifying collections of outlying samples that can be tagged for relabeling, or removed from consideration altogether.  

.. contents:: In this section
   :local:
   :depth: 2

Compute Patch Embeddings
-------------------------

In the previous step, you generated patch views that showed one detection label per image. You can similarly compute and visualize patch embeddings directly within the FiftyOne App.

In the toolbar about the same grid, select **Browse operations > Compute visualization**.

- For the brain key, type `yolow_patches`
- For the patches field, select **yolow_detections**

Leave all other settings as they are. You can refer to the `image embeddings documentation </tutorials/image_embeddings.html#Visualization-parameters>`_ for more details on supported visualization parameters.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/compute_visualization_config.webp
   :alt: VAL review interface
   :align: center
   :width: 90%

To run the embeddings computation, you can delegate as a background orchestration similar to the auto labeling run. Click the dropdown arrow next to **Execute** and select one of your delegated operators. Then click **Schedule**.

You can then navigate to the dataset's **Runs** tab to view the task's progress (same again as the auto labeling run).
   
.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/compute_visualization_run.webp
   :alt: VAL review interface
   :align: center
   :width: 100%

Once the task changes to **Completed** status, navigate back to the sample grid, then select **New panel > Embeddings**. Open the **Select brain key** dropdown, then select **yolow_patches**.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/embeddings_open_panel.webp
   :alt: VAL review interface
   :align: center
   :width: 30%


Analyze Patch Embeddings
------------------------

You should now see the embeddings space visualized within the Embeddings panel. This next part of the guide offers a bit of a choose your own adventure opportunity. The goal is to identify clusters of samples (or individual samples within clusters) that are mislabeled. 

.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/embeddings_full_view.webp
   :alt: VAL review interface
   :align: center
   :width: 100%

One option is to select **Color by > yolow_detections.detections.confidence**. You can then lasso low confidence clusters and identify if any are false positives.

Another option is to color by label prediction (**Color by > yolow_detections.detections.label**). Look for an area that that suggests class confusion, e.g., one or two green dots in a sea of red. Click and drag to lasso that area and verify in the samply grid if any objects are mislabeled (e.g., a car to a truck, or a person to a bicycle). 

.. tip::
        You can easily combine class and confidence filtering by visualizing the embeddings by label and then setting a minimum and maximum confidence filter for the **yolow_detections** field in the left sidebat.

Below we see an example of a false positive, insofar as the model incorrectly labeled a gas station logo as a traffic sign.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/embeddings_lasso_labels.webp
   :alt: VAL review interface
   :align: center
   :width: 100%

After tagging at least a few incorrect samples, a good next step is to mark them for either human correction or deletion. Select your desired incorrect samples from the sample grid, then click **Tag samples or labels** in the toolbar. Give the tag a name like `needs-review`, then click **Add needs-review tag** and then finally **Apply**. The tag then becomes a saved view you can share with your team for further QA.

.. image:: https://cdn.voxel51.com/getting_started_val/notebook4/tag_samples.webp
   :alt: VAL review interface
   :align: center
   :width: 50%

Next Steps
----------

This tends to be an iterative process. Feel free to continue analyzing parts of the embeddings space, finding and tag samples as needed. You can also use this opportunity to return to the Auto Labeling panel and batch additional true positives for approval.

In the next and final step, you will finalize your predictions and approve your new ground truth labels.

**Next**: :ref:`Step 5: Finalize Approvals <val_finalize>`
