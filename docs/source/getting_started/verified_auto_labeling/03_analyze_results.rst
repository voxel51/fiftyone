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

Sample Grid Exploration
-----------------------

Compute and view patches
------------------------

Using the Embeddings Panel
---------------------------

Next Steps
----------

You've now thoroughly analyzed your predictions and understand their quality distribution. The next step is to efficiently batch approve correct predictions.

Click **Next** to proceed to :ref:`Step 4: Batch Approve Labels <val_batch_approve>`.
