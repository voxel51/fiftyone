Summary: What You've Learned
============================

.. default-role:: code

You've completed the Annotation Getting Started Guide. Here's what you can now do.

Quickstart Track
----------------

You learned the basics of multimodal annotation:

- Load grouped datasets with synchronized 2D/3D data
- Switch between camera slices and point clouds
- Enter Annotate mode (sample modal -> Annotate tab)
- Create label fields with enforced schemas
- Draw bounding boxes on images
- Explore point cloud data in the 3D visualizer

Full Loop Track
---------------

You built a complete data-centric annotation pipeline for multimodal data:

**Step 2: Setup Splits**
   Cloned quickstart-groups to ``annotation_tutorial``. Created test (frozen), val (iteration), golden (QA), and pool splits **at the group level** to prevent data leakage across modalities.

**Step 3: Smart Selection**
   Used ZCore diversity scoring on camera images to select high-coverage scenes. Better than random.

**Step 4: 2D Annotation**
   Labeled detections on left camera images with KITTI schema enforcement. Only samples with actual labels get marked as annotated.

**Step 5: 3D Annotation**
   Annotated cuboids on point clouds using transform controls. Used camera projections to verify 3D→2D alignment.

**Step 6: Train + Evaluate**
   Trained YOLOv8 on camera images, evaluated on val set, tagged FP/FN failures for targeting.

**Step 7: Iteration**
   Ran Golden QA check, then selected next batch using hybrid strategy: 30% coverage + 70% targeted.

Key Takeaways
-------------

1. **Group-level splits are non-negotiable.** Without them, the same scene leaks between train and test.

2. **Label smarter, not harder.** Diversity sampling + failure targeting beats random selection.

3. **30% coverage budget matters.** Only chasing failures creates a model that fails on normal cases.

4. **Cross-modal consistency.** 2D and 3D labels should agree on the same objects.

5. **QA before training.** Golden QA checks catch annotation drift early.

6. **Understand your failures.** FP/FN analysis tells you what to label next.

When to Use What
----------------

**In-app annotation is good for:**

- Small to medium tasks (tens to hundreds of samples)
- Multimodal data with linked 2D/3D views
- Quick corrections and QA passes
- Prototyping label schemas
- Single annotator workflows
- Tight model-labeling feedback loops

**Use external tools (CVAT, Label Studio, Labelbox) when:**

- High-volume annotation with distributed teams
- Complex labeling pipelines requiring external infrastructure

FiftyOne integrates with external annotation tools. See :ref:`Integrations <integrations>` for details.

What's Next
-----------

- **Apply to your data** - Use this workflow on your production datasets
- **Explore 3D fully** - Try more complex 3D scenes with occlusions
- **Scale with teams** - The schema and QA workflow supports multiple annotators
- **Explore plugins** - Check `@voxel51/brain` for advanced selection operators

Resources
---------

* :ref:`FiftyOne 3D Visualizer <app-3d-visualizer>`

* :doc:`FiftyOne Brain - Embeddings </brain>`

* :doc:`FiftyOne Evaluation API </user_guide/evaluation>`

* :doc:`Annotation Integrations </integrations/index>`

* :doc:`Grouped Datasets </user_guide/groups>`

* `ZCore Repository <https://github.com/voxel51/zcore>`_

* `YOLOv8 Documentation <https://docs.ultralytics.com/>`_

Feedback
--------

Questions or suggestions? Reach us at `support@voxel51.com` or join our `Discord <https://community.voxel51.com>`_.
