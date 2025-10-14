.. _val_tag_problems:

Step 5: Tag Problem Cases
==========================

.. default-role:: code

Not all predictions are approve-worthy. This step teaches you to systematically mark problematic samples for later attention, creating an organized workflow for corrections.

**Why Tag Instead of Immediately Correcting?**

- **Maintain flow**: Don't break review momentum
- **Batch processing**: Handle similar issues together later
- **Team coordination**: Assign tagged sets to specialists
- **Pattern recognition**: Similar issues cluster together

**Common Tag Categories**:

.. list-table::
   :widths: 30 70
   :header-rows: 1

   * - Tag
     - Use For
   * - `needs_correction`
     - Generic flag for manual review
   * - `false_positive`
     - Incorrect detections to remove
   * - `wrong_class`
     - Detection correct, wrong label
   * - `poor_bbox`
     - Right object, poor localization
   * - `missing_object`
     - Ground truth object missed by model
   * - `low_confidence`
     - Borderline cases for secondary review
   * - `ambiguous`
     - Unclear/subjective cases needing discussion

**Tagging Individual Samples**:

1. Click sample to open modal view
2. Click tag icon (🏷️) or press 'T'
3. Create new tag or select existing
4. Add optional notes
5. Click "Save"

**Batch Tagging**:

1. Select multiple samples (Cmd/Ctrl + click)
2. Right-click → "Tag Samples"
3. Choose tag
4. Apply to all selected

**Tagging Workflow Example**:

.. code-block:: text

   Scenario: Reviewing "car" detections at confidence 0.4-0.6
   
   Found issues:
   - 15 trucks misclassified as cars → Tag: "wrong_class"
   - 8 car reflections detected as cars → Tag: "false_positive"
   - 12 partial car views inconsistent → Tag: "ambiguous"
   - 5 cars with poor boxes → Tag: "poor_bbox"
   
   Result: 40 tagged samples, organized by issue type
   Next: Address each tag category in focused sessions

**Using Tags for Filtered Views**:

After tagging:

1. Click tag name in left sidebar
2. View shows only tagged samples
3. Process corrections systematically
4. Remove tags after fixing

**Tag Management Best Practices**:

✓ **Consistent naming**: Establish conventions early
✓ **Descriptive**: Clear what issue represents
✓ **Hierarchical**: Use prefixes for categories (`fp_reflection`, `fp_shadow`)
✓ **Document**: Maintain tag definitions for team
✓ **Clean up**: Remove tags after addressing issues

**When to Tag vs. Approve**:

*Tag if*:
- Incorrect class assignment
- Poor localization requiring adjustment
- False positive detection
- Ambiguous/borderline case
- Part of systematic error pattern

*Approve if*:
- Correct class and reasonable localization
- Minor imperfections acceptable for use case
- Confidence score matches quality

**Next Steps with Tagged Samples**:

After VAL workflow completes:

1. **Filter by tag**: View specific problem category
2. **Manual correction**: Fix issues directly
3. **Re-run VAL**: Use different model/settings
4. **Training data**: Use as hard negatives or edge cases
5. **Remove tags**: After resolution

**Next**: :ref:`Step 6: Finalize Workflow <val_finalize>`
