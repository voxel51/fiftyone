.. _evaluating-models:

Evaluating Models
=================

.. default-role:: code

.. customavailablein::
    :oss_version: 0.7.3
    :enterprise_version: 1.0

FiftyOne provides a variety of builtin methods for evaluating your model
predictions, including regressions, classifications, detections, polygons,
instance and semantic segmentations, on both image and video datasets.

When you evaluate a model in FiftyOne, you get access to the standard aggregate
metrics such as classification reports, confusion matrices, and PR curves
for your model. In addition, FiftyOne can also record fine-grained statistics
like accuracy and false positive counts at the sample-level, which you can
:ref:`interactively explore <app-model-evaluation-panel>` in the App to diagnose
the strengths and weaknesses of your models on individual data samples.

Sample-level analysis often leads to critical insights that will help you
improve your datasets and models. For example, viewing the samples with the
most false positive predictions can reveal errors in your annotation schema.
Or, viewing the cluster of samples with the lowest accuracy can reveal gaps in
your training dataset that you need to address in order to improve your model's
performance. A key goal of FiftyOne is to help you uncover these insights on
your data!

.. note::

     Check out the :ref:`tutorials page <tutorials>` for in-depth walkthroughs
     of evaluating various types of models with FiftyOne, or the
     :ref:`Model Evaluation Guide <model_evaluation_guide>` for a complete
     step-by-step walkthrough.

Overview
________

FiftyOne's evaluation methods are conveniently exposed as methods on all
|Dataset| and |DatasetView| objects, which means that you can evaluate entire
datasets or specific views into them via the same syntax.

Let's illustrate the basic workflow by loading the
:ref:`quickstart dataset <dataset-zoo-quickstart>` and analyzing the object
detections in its `predictions` field using the
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Evaluate the objects in the `predictions` field with respect to the
    # objects in the `ground_truth` field
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
    )

    session = fo.launch_app(dataset)

Per-class metrics
-----------------

You can also retrieve and interact with evaluation results via the SDK.

Running an evaluation returns an instance of a task-specific subclass of
|EvaluationResults| that provides a handful of methods for generating aggregate
statistics about your dataset.

.. code-block:: python
    :linenos:

    # Get the 10 most common classes in the dataset
    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    results.print_report(classes=classes)

.. code-block:: text

                   precision    recall  f1-score   support

           person       0.45      0.74      0.56       783
             kite       0.55      0.72      0.62       156
              car       0.12      0.54      0.20        61
             bird       0.63      0.67      0.65       126
           carrot       0.06      0.49      0.11        47
             boat       0.05      0.24      0.08        37
        surfboard       0.10      0.43      0.17        30
    traffic light       0.22      0.54      0.31        24
         airplane       0.29      0.67      0.40        24
          giraffe       0.26      0.65      0.37        23

        micro avg       0.32      0.68      0.44      1311
        macro avg       0.27      0.57      0.35      1311
     weighted avg       0.42      0.68      0.51      1311

.. note::

    For details on micro, macro, and weighted averaging, see the 
    `sklearn.metrics documentation  <https://scikit-learn.org/stable/modules/generated/sklearn.metrics.precision_recall_fscore_support.html#sklearn.metrics.precision_recall_fscore_support>`_.

Per-sample metrics
------------------

In addition to standard aggregate metrics, when you pass an ``eval_key``
parameter to the evaluation routine, FiftyOne will populate helpful
task-specific information about your model's predictions on each sample, such
as false negative/positive counts and per-sample accuracies.

Continuing with our example, let's use :ref:`dataset views <using-views>` and
the :ref:`FiftyOne App <fiftyone-app>` to leverage these sample metrics to
investigate the samples with the most false positive predictions in the
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    from fiftyone import ViewField as F

    # Create a view that has samples with the most false positives first, and
    # only includes false positive boxes in the `predictions` field
    view = (
        dataset
        .sort_by("eval_fp", reverse=True)
        .filter_labels("predictions", F("eval") == "fp")
    )

    # Visualize results in the App
    session = fo.launch_app(view=view)

.. image:: /images/evaluation/quickstart_evaluate_detections.gif
   :alt: quickstart-evaluate-detections
   :align: center

|br|
Notice anything wrong? The sample with the most false positives is a plate of
carrots where the entire plate has been boxed as a single example in the ground
truth while the model is generating predictions for individual carrots!

If you're familiar with `COCO format <https://cocodataset.org/#format-data>`_
(which is recognized by
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
by default), you'll notice that the issue here is that the ``iscrowd``
attribute of this ground truth annotation has been incorrectly set to ``0``.
Resolving mistakes like these will provide a much more accurate picture of the
real performance of a model.

.. _confusion-matrices:

Confusion matrices
------------------

.. note::

    The easiest way to work with confusion matrices in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

When you use evaluation methods such as
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
that support confusion matrices, you can use the
:meth:`plot_confusion_matrix() <fiftyone.utils.eval.detection.DetectionResults.plot_confusion_matrix>`
method to render responsive plots that can be attached to App instances to
interactively explore specific cases of your model's performance:

.. code-block:: python
    :linenos:

    # Plot confusion matrix
    plot = results.plot_confusion_matrix(classes=classes)
    plot.show()

    # Connect to session
    session.plots.attach(plot)

.. image:: /images/plots/detection-evaluation.gif
   :alt: detection-evaluation
   :align: center

In this setup, you can click on individual cells of the confusion matrix to
select the corresponding ground truth and/or predicted objects in the App. For
example, if you click on a diagonal cell of the confusion matrix, you will
see the true positive examples of that class in the App.

Likewise, whenever you modify the Session's view, either in the App or by
programmatically setting
:meth:`session.view <fiftyone.core.session.Session.view>`, the confusion matrix
is automatically updated to show the cell counts for only those objects that
are included in the current view.

.. _analyzing-scenarios:

Analyzing scenarios  __SUB_NEW__
--------------------------------

.. customavailablein::
    :oss_version: 1.6.0
    :enterprise_version: 2.9.1

.. note::

    Did you know? You can create and analyze model evaluation scenarios in the
    App via the :ref:`Scenario Analysis tab <app-scenario-analysis>`.

The :meth:`use_subset() <fiftyone.utils.eval.base.BaseClassificationResults.use_subset>`
method allows you to evaluate the performance of your model under specific
scenarios, i.e., subsets of the overall dataset on which evaluation was
performed.

Consider the following example:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.random as four
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    four.random_split(dataset, {"sunny": 0.7, "cloudy": 0.2, "rainy": 0.1})

    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:5]

    dataset.save_view("take100", dataset.take(100))

    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
    )

By default, invoking methods on an |EvaluationResults| instance reports
statistics across the entire evaluation:

.. code-block:: python
    :linenos:

    # Full results
    results.print_report(classes=classes)

.. code-block:: text

                  precision    recall  f1-score   support

          person       0.52      0.94      0.67       716
            kite       0.59      0.88      0.71       140
             car       0.18      0.80      0.29        61
            bird       0.65      0.78      0.71       110
          carrot       0.09      0.74      0.16        47

       micro avg       0.42      0.90      0.57      1074
       macro avg       0.41      0.83      0.51      1074
    weighted avg       0.51      0.90      0.64      1074

However, you can use
:meth:`use_subset() <fiftyone.utils.eval.base.BaseClassificationResults.use_subset>`
to analyze the performance of the model on specific subsets of interest:

.. tabs::

  .. group-tab:: Sunny samples

    .. code-block:: python
        :linenos:

        # Sunny samples
        subset_def = dict(type="field", field="tags", value="sunny")
        with results.use_subset(subset_def):
            results.print_report(classes=classes)

    .. code-block:: text

                      precision    recall  f1-score   support

              person       1.00      0.93      0.96       495
                kite       1.00      0.90      0.95        62
                 car       1.00      0.69      0.81        35
                bird       1.00      0.78      0.88       104
              carrot       1.00      0.69      0.82        36

           micro avg       1.00      0.88      0.94       732
           macro avg       1.00      0.80      0.88       732
        weighted avg       1.00      0.88      0.94       732

  .. group-tab:: Small objects

    .. code-block:: python
        :linenos:

        # Small objects
        bbox_area = F("bounding_box")[2] * F("bounding_box")[3]
        small_objects = bbox_area <= 0.05
        subset_def = dict(type="attribute", expr=small_objects)
        with results.use_subset(subset_def):
            results.print_report(classes=classes)

    .. code-block:: text

                      precision    recall  f1-score   support

              person       1.00      0.87      0.93       324
                kite       1.00      0.76      0.87        72
                 car       1.00      0.79      0.88        56
                bird       1.00      0.52      0.69        46
              carrot       1.00      0.75      0.86        40

           micro avg       1.00      0.81      0.89       538
           macro avg       1.00      0.74      0.84       538
        weighted avg       1.00      0.81      0.89       538

  .. group-tab:: Saved view

    .. code-block:: python
        :linenos:

        # Saved view
        subset_def = dict(type="view", view="take100")
        with results.use_subset(subset_def):
            results.print_report(classes=classes)

    .. code-block:: text

                      precision    recall  f1-score   support

              person       1.00      0.94      0.97       292
                kite       1.00      0.93      0.97        15
                 car       1.00      0.87      0.93        15
                bird       1.00      0.35      0.52        23
              carrot       1.00      0.67      0.80         9

           micro avg       1.00      0.89      0.94       354
           macro avg       1.00      0.75      0.84       354
        weighted avg       1.00      0.89      0.93       354

  .. group-tab:: Compound subset

    .. code-block:: python
        :linenos:

        # Sunny samples + small objects
        subset_def = [
            dict(type="field", field="tags", value="sunny"),
            dict(type="attribute", expr=small_objects),
        ]
        with results.use_subset(subset_def):
            results.print_report(classes=classes)

    .. code-block:: text

                      precision    recall  f1-score   support

              person       1.00      0.85      0.92       227
                kite       1.00      0.87      0.93        45
                 car       1.00      0.66      0.79        32
                bird       1.00      0.48      0.65        42
              carrot       1.00      0.71      0.83        31

           micro avg       1.00      0.79      0.88       377
           macro avg       1.00      0.71      0.82       377
        weighted avg       1.00      0.79      0.87       377

Refer to
:meth:`use_subset() <fiftyone.utils.eval.base.BaseClassificationResults.use_subset>`
and
:func:`get_subset_view() <fiftyone.utils.eval.base.get_subset_view>` for a
complete description of the supported syntax for defining subsets to analyze.

.. _managing-evaluations:

Managing evaluations
--------------------

When you run an evaluation with an ``eval_key`` argument, the evaluation is
recorded on the dataset and you can retrieve information about it later, rename
it, delete it (along with any modifications to your dataset that were performed
by it), and :ref:`retrieve the view <load-evaluation-view>` that you evaluated
on using the following methods on your dataset:

-   :meth:`list_evaluations() <fiftyone.core.collections.SampleCollection.list_evaluations>`
-   :meth:`get_evaluation_info() <fiftyone.core.collections.SampleCollection.get_evaluation_info>`
-   :meth:`load_evaluation_results() <fiftyone.core.collections.SampleCollection.load_evaluation_results>`
-   :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
-   :meth:`rename_evaluation() <fiftyone.core.collections.SampleCollection.rename_evaluation>`
-   :meth:`delete_evaluation() <fiftyone.core.collections.SampleCollection.delete_evaluation>`

The example below demonstrates the basic interface:

.. code-block:: python
    :linenos:

    # List evaluations you've run on a dataset
    dataset.list_evaluations()
    # ['eval']

    # Print information about an evaluation
    print(dataset.get_evaluation_info("eval"))

    # Load existing evaluation results and use them
    results = dataset.load_evaluation_results("eval")
    results.print_report()

    # Rename the evaluation
    # This will automatically rename any evaluation fields on your dataset
    dataset.rename_evaluation("eval", "still_eval")

    # Delete the evaluation
    # This will remove any evaluation data that was populated on your dataset
    dataset.delete_evaluation("still_eval")

.. _model-evaluation-panel:

Model Evaluation panel __SUB_NEW__
__________________________________

.. customavailablein::
    :oss_version: 1.1.0
    :enterprise_version: 2.2.0

When you load a dataset in the App that contains one or more
:ref:`evaluations <evaluating-models>`, you can open the
:ref:`Model Evaluation panel <app-model-evaluation-panel>` to visualize and
interactively explore the evaluation results in the App:

.. image:: /images/app/model-evaluation-compare.gif
    :alt: model-evaluation-compare
    :align: center

.. note::

    Did you know? With :ref:`FiftyOne Enterprise <fiftyone-enterprise>` you can execute
    model evaluations natively from the App
    :ref:`in the background <delegated-operations>` while you work.

