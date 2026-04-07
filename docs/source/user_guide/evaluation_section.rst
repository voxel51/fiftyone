.. _user-guide-evaluation:

Model Evaluation
================

.. default-role:: code

Aggregate metrics like mAP or accuracy tell you how a model performs on
average, but they rarely tell you *why* it fails or *where* to improve it.
FiftyOne's evaluation tools connect quantitative metrics directly to the
samples that drive them, so you can see your model's mistakes visually and
take targeted action.

After evaluation, return to :ref:`Explore & Curate <user-guide-explore-curate>`
to build views around failure cases, then to :ref:`Annotation
<user-guide-annotation>` to fix the data that matters most.

**In this section:**

- :doc:`Evaluating models <evaluation>` — Run FiftyOne's built-in evaluation
  routines for detection, classification, and segmentation. Analyze TP/FP/FN
  breakdowns, per-class performance, and identify your model's hardest samples.

.. toctree::
   :maxdepth: 1
   :hidden:

   Evaluating models __SUB_NEW__ <evaluation>
