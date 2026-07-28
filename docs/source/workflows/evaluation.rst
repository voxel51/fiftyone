.. _workflows-evaluation:

Model Evaluation
================

Once your dataset contains predictions, FiftyOne's :ref:`evaluation API
<evaluating-models>` computes standard metrics (mAP, precision/recall,
confusion matrices) and — more importantly — lets you drill into the
individual successes and failures behind them. Use the :ref:`Model Evaluation
panel <app-model-evaluation-panel>` to explore and compare evaluation runs in
the App, :ref:`scenario analysis <analyzing-scenarios>` to compare performance
across subsets of your data, and :ref:`mistakenness <brain-label-mistakes>` to
separate model errors from label errors.

.. toctree::
   :maxdepth: 1
   :hidden:

   Evaluating models __SUB_NEW__ <../user_guide/evaluation>
   Evaluating object detections <../tutorials/evaluate_detections.ipynb>
   Evaluating a classifier <../tutorials/evaluate_classifications.ipynb>
