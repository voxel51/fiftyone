.. _val_batch_approve:

Step 4: Batch Approve Labels
=============================

.. default-role:: code

After analyzing predictions, it's time to efficiently approve high-quality labels in batches. This systematic approach maximizes efficiency while maintaining quality control.

**Batch Approval Workflow**:

1. **Set confidence range** (start high: 0.7-1.0)
2. **Visual verification** using patches view or grid
3. **Select label classes** in the label table
4. **Click "Add to Approval"** button
5. **Repeat for lower confidence ranges**

**Selection Strategies**:

*By Confidence*:
- High (0.7-1.0): Quick approval after visual spot-check
- Medium (0.5-0.7): More careful per-class review
- Low (0.3-0.5): Very selective, only obvious correct cases

*By Class*:
- Start with easy, high-precision classes
- Approve classes with clear visual characteristics
- Save ambiguous classes for end

**Using the Label Table**:

The label table is your primary tool for batch operations:

.. code-block:: text

   ✓ Check boxes next to correct label classes
   ✓ Multiple selections supported
   ✓ Click "Add to Approval" to batch move
   ✓ Confirmation shows instance count moved

**Visual Verification Tips**:

- **Patches view**: Rapidly scan dozens of instances
- **Random sampling**: Spot-check a few samples per class
- **Look for patterns**: Consistent quality across instances?
- **Trust but verify**: Even high confidence can have errors

**Example Workflow**:

.. code-block:: text

   1. Slider: 0.8-1.0
      Review: 500 "car" instances in patches view
      Action: All look good → Check "car" → Add to Approval

   2. Slider: 0.7-0.9
      Review: 300 "person" instances
      Action: Most good, some partial occlusions
      → Check "person" → Add to Approval
      → Tag 10 poorly localized samples

   3. Slider: 0.5-0.7
      Review: "bicycle" class
      Action: Mixed quality, approve only clear ones
      → Manually select good samples
      → Tag questionable for manual review

**Verification in Approval Queue**:

After moving labels to Approval:

1. Switch to **Approval** tab
2. Review moved labels one more time
3. Use "Undo" if you change your mind
4. Confidence slider still works for filtering

**Best Practices**:

✓ **Start conservative**: Easier to add more later than remove bad labels
✓ **Document decisions**: Note confidence thresholds used
✓ **Check corners**: Review a few low-confidence approved items
✓ **Use undo freely**: No penalty for changing your mind

**Next**: :ref:`Step 5: Tag Problem Cases <val_tag_problems>`
