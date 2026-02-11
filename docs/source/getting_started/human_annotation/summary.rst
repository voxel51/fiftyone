Summary: What You've Learned
============================

.. default-role:: code

You've completed the Human Annotation Guide. Here's what you can now do.

Quickstart Track
----------------

You learned the basics of in-app annotation:

- Clone datasets to keep originals clean
- Enter Annotate mode (sample modal -> Annotate tab)
- Create label fields with enforced schemas
- Draw bounding boxes and assign classes
- Verify labels saved correctly
- Export labeled data for training

Full Loop Track
---------------

You built a complete data-centric annotation pipeline:

**Step 2: Setup Splits**
   Created test (frozen), val (iteration), golden (QA), and pool splits. These prevent evaluation contamination.

**Step 3: Smart Selection**
   Used ZCore diversity scoring to select high-coverage samples. Better than random.

**Step 4: Annotation + QA**
   Labeled samples with schema enforcement. Only samples with actual labels get marked as annotated.

**Step 5: Train + Evaluate**
   Trained YOLOv8, evaluated on val set, tagged FP/FN failures for targeting.

**Step 6: Iteration**
   Ran Golden QA check, then selected next batch using hybrid strategy: 30% coverage + 70% targeted.

Key Takeaways
-------------

1. **Splits are non-negotiable.** Without frozen test and golden QA, your metrics lie.

2. **Label smarter, not harder.** Diversity sampling + failure targeting beats random selection.

3. **30% coverage budget matters.** Only chasing failures creates a model that fails on normal cases.

4. **QA before training.** Golden QA checks catch annotation drift early.

5. **Understand your failures.** FP/FN analysis tells you what to label next.

When to Use What
----------------

**In-app annotation is good for:**

- Small to medium tasks (tens to hundreds of samples)
- Quick corrections and QA passes
- Prototyping label schemas
- Single annotator workflows
- Tight model-labeling feedback loops

**Use external tools (CVAT, Label Studio) when:**

- High-volume annotation with teams
- Role-based review workflows
- Audit trails and agreement metrics needed

FiftyOne integrates with external tools via the :ref:`annotation API <fiftyone-annotation>`.

What's Next
-----------

- **Apply to your data** - Use this workflow on your production datasets
- **Scale with teams** - The schema and QA workflow supports multiple annotators
- **Explore plugins** - Check `@voxel51/brain` for advanced selection operators

Resources
---------

* `FiftyOne Brain - Embeddings <../../user_guide/brain.html>`_
* `FiftyOne Evaluation API <../../user_guide/evaluation.html>`_
* `External Annotation Integration <../../user_guide/annotation.html>`_
* `ZCore Repository <https://github.com/voxel51/zcore>`_
* `YOLOv8 Documentation <https://docs.ultralytics.com/>`_

Feedback
--------

Questions or suggestions? Reach us at `support@voxel51.com` or join our `Discord <https://community.voxel51.com>`_.
