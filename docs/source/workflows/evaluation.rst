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

   Evaluation Overview <../user_guide/evaluation/index>
   Evaluating Regressions <../user_guide/evaluation/regressions>
   Evaluating Classifications <../user_guide/evaluation/classifications>
   Evaluating Detections <../user_guide/evaluation/detections>
   Evaluating Segmentations <../user_guide/evaluation/segmentations>
   Advanced Evaluation Usage <../user_guide/evaluation/advanced>
