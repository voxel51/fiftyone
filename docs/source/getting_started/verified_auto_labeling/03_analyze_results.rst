.. _val_analyze_results:

Step 3: Analyze Predictions
============================

.. default-role:: code

Your VAL run has completed, and predictions are ready for review. This step teaches you how to systematically analyze auto-generated labels using FiftyOne's powerful exploration tools.

.. contents:: In this section
   :local:
   :depth: 2

Review Interface Overview
-------------------------

When your run status changes to **In Review**, the Auto Labeling panel displays the review interface with three tabs:

1. **Analyze** - Review and filter all predictions
2. **Approval** - Queue of labels marked for final acceptance  
3. **Approved** - Read-only view after finalization

The Confidence Slider
---------------------

Located at the top of the review panel, this is your primary filtering tool.

**How It Works**:

- Drag handles to set min/max confidence range
- Grid view updates in real-time to show only labels within range
- Label table reflects filtered label counts
- Default range: 0.0 to 1.0 (shows all predictions)

**Strategic Use**:

.. code-block:: text

   High confidence (0.7-1.0):
   → Quick batch approval
   → High precision, few false positives
   → Start here for efficiency

   Medium confidence (0.4-0.7):
   → Careful review needed
   → Mix of correct and incorrect
   → Selective approval

   Low confidence (0.0-0.4):
   → Many false positives expected
   → Useful for finding rare instances
   → Review cautiously

**Example Workflow**:

1. Set slider to 0.7-1.0
2. Review and batch approve obvious correct predictions
3. Lower to 0.5-0.7  
4. Review more carefully, approve good ones
5. Check 0.3-0.5 range for any gems
6. Tag remaining low-confidence for manual review

Understanding the Label Table
------------------------------

The label table shows all predicted label classes with key metrics:

.. list-table::
   :widths: 25 75
   :header-rows: 1

   * - Column
     - Description
   * - **Label Name**
     - Class name (e.g., "car", "person")
   * - **Applicable Instances**
     - Count of instances within current confidence range
   * - **Model Confidence**
     - Average confidence score for this class
   * - **Total Instances**
     - Total count across all confidence ranges
   * - **Checkbox**
     - Select for batch operations

**Interacting with the Table**:

- **Click label row** → Filter grid to show only that class
- **Check multiple boxes** → Batch select for approval
- **Sort by columns** → Organize by confidence or count

Sample Grid Exploration
-----------------------

The main grid view displays samples containing labels in "analyze" state.

**Navigation**:

- **Click sample** → Open in modal/expanded view
- **Arrow keys** (→ ←) → Navigate between samples in modal
- **Hover over labels** → See confidence scores
- **Right-click** → Access tagging and other operations

**What to Look For**:

✓ **Correct detections** - Proper class, well-localized boxes
✗ **False positives** - Incorrect detections to discard
✗ **Wrong class** - Detection correct but wrong label
✗ **Poor localization** - Right object, poor bounding box
? **Borderline cases** - Ambiguous, needs human judgment

Leveraging Patches View
------------------------

For object detection, patches view is a game-changer for rapid review.

**Activating Patches View**:

1. Click **View** menu in top navigation
2. Select **View Patches** (or use keyboard shortcut)
3. Grid switches from full images to individual object crops

**Benefits**:

- **Scan hundreds of detections quickly** - See only relevant regions
- **Identify systematic errors** - Similar-looking mistakes cluster visually
- **Compare similar objects** - Assess consistency across instances
- **Reduce cognitive load** - Focus on objects, not entire scenes

**Example Use Case**:

.. code-block:: text

   Scenario: Model detecting "car" class
   
   Patches view reveals:
   - Most cars correctly detected
   - Trucks being misclassified as cars (tag for correction)
   - Car reflections causing false positives (tag for removal)
   - Partially visible cars detected inconsistently (review case-by-case)

**Returning to Image View**:

- Click **View** → **View Images** to exit patches mode

Using the Embeddings Panel
---------------------------

Embeddings provide a bird's-eye view of prediction similarity and quality.

**Compute Embeddings** (if not already done):

1. Click **Brain** icon (🧠) in top menu
2. Select **Compute Visualization**
3. Choose method:
   - **UMAP** - General-purpose, good clusters
   - **t-SNE** - Emphasizes local structure
   - **PCA** - Fast, linear relationships
4. Wait for computation to complete

**Analyzing the Embedding Plot**:

Once computed, the Embeddings panel shows an interactive scatter plot:

- **Each point** = A label instance or sample
- **Proximity** = Visual/semantic similarity  
- **Clusters** = Groups of similar predictions
- **Outliers** = Unusual or potentially erroneous

**Interactive Features**:

- **Click points** → View corresponding samples
- **Lasso select region** → Filter to selected samples
- **Color by attribute** → Visualize confidence, class, etc.
- **Search for patterns** → Identify systematic model behaviors

**Finding Issues with Embeddings**:

.. code-block:: text

   Look for:
   
   Mixed clusters → Different classes grouped together (model confusion)
   Outlier clouds → Potential false positives or edge cases
   Confidence patterns → Low confidence concentrated in specific regions
   Class separation → Well-separated classes indicate good model performance

**Example Analysis**:

.. code-block:: text

   Embedding reveals:
   - "car" and "truck" predictions overlap (model struggles with distinction)
   - Cluster of low-confidence "person" predictions (review these specifically)
   - Clear separation between "bicycle" and other vehicles (model confident)

Systematic Review Strategy
---------------------------

**Recommended Workflow**:

1. **High-level overview**
   - Check label table for class distribution
   - Note any unexpected classes or counts
   - Identify high-confidence classes for quick approval

2. **High-confidence review** (0.7-1.0)
   - Use patches view for rapid scanning
   - Batch approve obviously correct labels
   - Tag any surprising errors

3. **Medium-confidence review** (0.4-0.7)
   - Return to image view for context
   - Review more carefully
   - Approve good predictions, tag questionable ones

4. **Low-confidence spot-check** (0.0-0.4)
   - Use embeddings to identify patterns
   - Look for rare but correct instances
   - Tag systematic errors

5. **Cross-check with embeddings**
   - Investigate unusual clusters
   - Verify model behavior is sensible
   - Identify failure modes

Quality Assessment Questions
-----------------------------

As you review, ask:

**About Individual Predictions**:
- Is the bounding box tight and accurate?
- Is the class label correct?
- Is the confidence score reasonable given prediction quality?

**About Patterns**:
- Are there systematic misclassifications?
- Does model struggle with specific object sizes/orientations?
- Are certain classes confused with each other?

**About Coverage**:
- Are important objects being missed (false negatives)?
- Are there many false positives?
- Is recall or precision more problematic?

Next Steps
----------

You've now thoroughly analyzed your predictions and understand their quality distribution. The next step is to efficiently batch approve correct predictions.

Click **Next** to proceed to :ref:`Step 4: Batch Approve Labels <val_batch_approve>`.

.. tip::
   **Take notes!** As you analyze, document patterns you observe. These insights guide confidence threshold adjustments, model selection for future runs, and training data priorities.
