.. _val_finalize:

Step 6: Finalize Your VAL Workflow
===================================

.. default-role:: code

You've analyzed, approved, and tagged predictions. Now it's time to finalize the workflow, integrating approved labels into your dataset while discarding problematic predictions.

Pre-Finalization Checklist
---------------------------

Before finalizing, verify:

.. list-table::
   :widths: 70 30
   :header-rows: 1

   * - Item
     - Status
   * - Reviewed approval queue for correctness
     - ☐
   * - Tagged all problematic samples
     - ☐
   * - Spot-checked random approved samples
     - ☐
   * - Documented confidence thresholds used
     - ☐
   * - Noted any systematic model issues
     - ☐

Final Review of Approval Queue
------------------------------


1. Switch to **Approval** tab
2. Review label table statistics
3. Use confidence slider for spot-checks
4. Browse sample grid for sanity check
5. Use "Undo" for any last-minute changes
6. Confirm sample and label counts look reasonable

Understanding Finalization
--------------------------

When you finalize:

✓ **Labels in Approval** → Added to dataset permanently
✓ **Labels in Analyze** → Discarded, not added
✓ **Tagged samples** → Remain tagged for future work
✓ **Original samples** → Unchanged (non-destructive)

Finalize Process
----------------

1. Click **"Finalize Labels"** button in Approval tab
2. Confirmation dialog displays:
   - Number of labels to be added
   - Number of samples affected
   - Label field name
3. Review summary carefully
4. Click **"Confirm"** to proceed
5. Status changes to "Approved"

What Happens During Finalization
--------------------------------


.. code-block:: python

   # Conceptually, finalization does:
   for sample in dataset:
       if sample.has_approved_labels_from_run:
           # Add approved labels to label field
           sample[label_field] = approved_labels
       # Discard unapproved labels
       remove_unapproved_labels(sample)
   
   dataset.save()

Post-Finalization
-----------------

Panel switches to **Approved** tab showing:

- Read-only view
- Total labels added count
- Summary statistics
- No further edits possible (labels are now part of dataset)

Verifying Finalized Labels
--------------------------

1. Exit Auto Labeling panel
2. Main grid view now shows approved labels
3. Check sidebar for new label field
4. Browse samples to verify labels present
5. Use filters/views to explore labeled data

**Example Verification**:

.. code-block:: python

   import fiftyone as fo

   dataset = fo.load_dataset("my_dataset")
   
   # Check label field exists
   print(dataset.get_field_schema())
   
   # Count samples with new labels
   view = dataset.exists("auto_detections")
   print(f"{len(view)} samples have auto-labels")
   
   # Verify label distribution
   counts = dataset.count_values("auto_detections.detections.label")
   print(counts)

**Next Steps After Finalization**:

**1. Address Tagged Samples**:

.. code-block:: python

   # Filter to tagged samples
   tagged = dataset.match_tags("needs_correction")
   
   # Manual review and correction
   session = fo.launch_app(tagged)

**2. Export Labeled Data**:

.. code-block:: python

   # Export in preferred format
   dataset.export(
       export_dir="/path/to/export",
       dataset_type=fo.types.COCODetectionDataset,
       label_field="auto_detections"
   )

**3. Evaluate Results** (if ground truth available):

.. code-block:: python

   # Compare to ground truth
   results = dataset.evaluate_detections(
       pred_field="auto_detections",
       gt_field="ground_truth",
       eval_key="val_eval"
   )
   
   results.print_report()

**4. Iterate with Additional Runs**:

- Try different models
- Adjust confidence thresholds
- Apply to remaining unlabeled data
- Refine based on lessons learned

**5. Train Custom Models**:

Use approved labels for:
- Fine-tuning foundation models
- Training task-specific models
- Creating ensemble models
- Active learning loops

**Handling Mistakes After Finalization**:

If you discover errors post-finalization:

**Option 1: Manual Correction**

.. code-block:: python

   # Direct field editing
   for sample in dataset:
       # Modify labels as needed
       sample.save()

**Option 2: Delete and Re-run**

.. code-block:: python

   # Remove label field
   dataset.delete_sample_field("auto_detections")
   
   # Re-run VAL with adjusted settings

**Option 3: Append Additional Run**

.. code-block:: python

   # Run VAL to different label field
   # Manually merge or choose best labels

**Common Post-Finalization Tasks**:

1. **Documentation**: Record VAL run parameters and results
2. **Backup**: Save dataset state before further modifications
3. **Quality metrics**: Compute statistics on approved labels
4. **Team sharing**: Export or sync dataset with team
5. **Pipeline integration**: Feed labels into training workflows

**Lessons Learned**:

Document for future VAL runs:

- **Optimal confidence thresholds** for each model/class
- **Systematic model errors** to watch for
- **Tagging conventions** that worked well
- **Time estimates** for different dataset sizes
- **Model comparisons** if you ran multiple

**Congratulations!**

You've completed your first Verified Auto-Labeling workflow, transforming raw predictions into high-quality, verified dataset labels. This systematic approach balances speed with quality, dramatically accelerating annotation while maintaining human oversight.

**Next**: Review the :ref:`Guide Summary <val_guide_summary>` for key takeaways and next steps.

.. tip::
   **Save this workflow!** The process you've learned applies to any labeling task. With practice, you'll develop intuition for confidence thresholds, model selection, and review strategies tailored to your specific use cases.
