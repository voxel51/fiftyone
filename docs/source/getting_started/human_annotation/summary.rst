Summary: What You've Learned
============================

.. default-role:: code

Congratulations! You've completed the Human Annotation Guide. You now have a battle-tested framework for iterative annotation that actually works.

.. _human_annotation-summary-recap:

Step-by-Step Recap
------------------

**Step 1: Setup - Flatten Dataset and Create Splits**

You established the foundation that makes iterative annotation trustworthy:

- Flattened grouped KITTI data to a standard image dataset
- Created three critical splits: frozen test (15%), golden QA (5%), active pool (80%)
- Set up tracking fields for annotation status and provenance

**Step 2: Bootstrap Selection - Embeddings + ZCore**

You learned to select your first batch for coverage, not randomness:

- Computed embeddings to understand dataset structure
- Used uniqueness scoring to select diverse samples
- Created Batch v0 with coverage-optimized selection

**Step 3: Human Annotation Pass + QA**

You implemented a disciplined annotation workflow:

- Defined an annotation schema for consistency
- Used patch views for efficient per-object annotation
- Ran QA checks: missing labels, class distribution, bounding box sanity

**Step 4: Train Baseline + Evaluate**

You trained a model and learned to analyze failures:

- Exported to YOLO format and trained YOLOv8
- Evaluated with FiftyOne's detection evaluation
- Analyzed FP/FN breakdowns and confusion matrices
- Tagged failure cases for targeted selection

**Step 5: Iteration - Hybrid Acquisition Loop**

You implemented the complete iteration strategy:

- 30% coverage refresh (ZCore) to avoid tunnel vision
- 70% targeted mining: FN (35%), FP (21%), confusion (14%)
- Embedding-based neighbor expansion around failures
- The complete loop: Annotate → Train → Evaluate → Select → Repeat

.. _human_annotation-summary-key-learnings:

Key Learnings
-------------

**The Three Splits Are Non-Negotiable**

Without a frozen test set and golden QA set, your "improvements" are potentially lies. You'll contaminate your evaluation and build a model that only looks good on paper.

**Coverage + Targeted > Either Alone**

Only chasing failures creates a model that's great at edge cases and terrible at normal cases. The 30% coverage budget keeps you honest.

**QA Is Not Optional**

A 5-minute QA pass saves hours of debugging mysterious model failures. Check your labels before you trust them.

**Understand Your Failures**

Don't just look at mAP. The confusion matrix and per-sample FP/FN counts tell you what to label next.

.. _human_annotation-summary-artifacts:

Artifacts You Created
--------------------

**Dataset**

- `kitti_annotation_tutorial` - Your working dataset with all annotations and metadata

**Fields**

- `embeddings` - Image embeddings for similarity analysis
- `uniqueness` / `uniqueness_v1` - Diversity scores for selection
- `human_labels` - Human annotations (Batch v0)
- `predictions_v0` - Model predictions
- `annotation_status` - Tracking field

**Tags**

- `split:test`, `split:golden`, `split:pool` - Data splits
- `batch:v0`, `batch:v1` - Annotation batches
- `annotated:v0` - Completed annotations
- `failure:high_fn`, `failure:high_fp` - Failure cases
- `source:coverage_v1`, `source:fn_mining_v1`, etc. - Selection sources

**Saved Views**

- `test_set`, `golden_qa`, `active_pool` - Split views
- `batch_v0_to_annotate`, `batch_v1_to_annotate` - Annotation queues
- `eval_v0_failures` - Failure cases from evaluation

**Models**

- YOLOv8 checkpoint at `/tmp/yolo_runs/kitti_v0/weights/best.pt`

.. _human_annotation-summary-exercises:

Suggested Exercises
------------------

1. **Complete the Loop**: Annotate Batch v1, retrain, and compare metrics to v0. Did targeted selection help?

2. **Try Different Budgets**: Experiment with 50/50 or 20/80 coverage/targeted splits. What happens?

3. **Add More Failure Categories**: Implement class-specific mining (e.g., "only mine around Pedestrian failures")

4. **Golden Set Regression Testing**: After each iteration, check if golden set metrics regress. This catches label drift.

5. **Stopping Criteria**: Implement automatic stopping when gains per labeled sample drop below a threshold.

.. _human_annotation-summary-resources:

Resources and Further Reading
----------------------------

* `FiftyOne Documentation <https://docs.voxel51.com/>`_

* `FiftyOne Brain - Embeddings <../../user_guide/brain.html#embeddings>`_

* `FiftyOne Evaluation API <../../user_guide/evaluation.html>`_

* `Detection Evaluation Tutorial <../../tutorials/evaluate_detections.html>`_

* `YOLOv8 Documentation <https://docs.ultralytics.com/>`_

* `KITTI Dataset <http://www.cvlibs.net/datasets/kitti/>`_

* `Active Learning Best Practices <https://labelbox.com/blog/active-learning-for-machine-learning/>`_

.. _human_annotation-summary-next-steps:

What to Do Next
---------------

Now that you've mastered the human annotation loop:

* **Apply to Your Data** - Use this workflow on your production datasets

* **Scale with Teams** - The schema and QA workflow supports multi-annotator setups

* **Integrate with Labeling Tools** - FiftyOne integrates with CVAT, Label Studio, and more for larger-scale annotation

* **Explore 3D Annotation** - When grouped dataset support is available, apply similar workflows to 3D data

* **Automate the Pipeline** - Build scripts that run the iteration loop automatically

.. _human_annotation-summary-common-mistakes:

Common Mistakes to Avoid
------------------------

.. warning::

    These mistakes will waste your time and money:

1. **Using test set for selection** - Your metrics become meaningless

2. **Only labeling failures** - Model gets worse at normal cases

3. **Skipping QA** - Garbage labels → garbage model

4. **Not tracking provenance** - Can't debug what you can't trace

5. **Labeling randomly** - Wastes budget on redundant samples

6. **Ignoring class imbalance** - Minority classes need targeted attention

7. **Changing schema mid-project** - Creates inconsistent labels

.. _human_annotation-summary-feedback:

We'd Love Your Feedback
-----------------------

Your feedback helps us improve FiftyOne and create better learning experiences. Please let us know:

* What aspects of this guide were most helpful?
* What could be improved or clarified?
* What annotation workflows would you like to see covered?
* Any issues or bugs you encountered?

You can reach us at `support@voxel51.com` or join our `Discord community <https://community.voxel51.com>`_.

Thank you for completing the Human Annotation Guide! Go build models that work in the real world.
