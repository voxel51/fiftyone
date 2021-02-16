Evaluating Models
=================

.. default-role:: code

FiftyOne provides a variety of builtin methods for evaluating your model
predictions, including classifications, detections, and semantic segmentations,
on both image and video datasets.

When you evaluate a model in FiftyOne, you get access to the standard aggregate
statistics such as classification reports, confusion matrices, PR curves, mAP,
etc. for your model. In addition, FiftyOne can also record fine-grained
statistics like accuracy and false positive counts at the sample-level, which
you can leverage via :ref:`dataset views <using-views>` and the
:ref:`FiftyOne App <fiftyone-app>` to interactively explore the strengths and
weaknesses of your models on individual data samples.

Sample-level analysis often leads to critical insights that will help you
improve your datasets and models. For example, viewing the samples with the
most false positive predictions can reveal errors in your annotation schema.
Or, viewing the cluster of samples with the lowest accuracy can reveal gaps in
your training dataset that you need to address in order to improve your model's
performance.

.. note::

     Check out the :ref:`tutorials page <tutorials>` for in-depth walkthroughs
     of evaluating various types of models with FiftyOne.

.. _evaluating-models:

Overview
________

FiftyOne's evaluation methods are conveniently exposed as methods on all
|Dataset| and |DatasetView| objects, which means that you can evaluate entire
datasets or specific views into them via the same syntax.

Let's illustrate the basic workflow by loading the
:ref:`quickstart dataset <dataset-zoo-quickstart>` from the model zoo and
analyzing the object detections in its `predictions` field using the
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Evaluate the detections in the `predictions` field with respect to the
    # objects in the `ground_truth` field
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_predictions",
    )

Aggregate metrics
-----------------

Running an evaluation returns an |EvaluationResults| object, which provides a
handful of task-specific methods for generating aggregate statistics about
your dataset.

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

Sample metrics
--------------

In addition to standard aggregate metrics, when you pass an ``eval_key`` value
to the evaluation routine, FiftyOne will populate helpful task-specific
information about your model's predictions on each sample, such as false
negative/positive counts or per-sample accuracies.

Continuing with our example, let's leverage :ref:`dataset views <using-views>`
and the :ref:`FiftyOne App <fiftyone-app>` to investigate the samples with the
most false positive predictions in more detail:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    from fiftyone import ViewField as F

    # Show samples with the most false positives first, and only include false
    # positive boxes in the `predictions` field
    view = (
        dataset
        .sort_by("eval_predictions_fp", reverse=True)
        .filter_labels("predictions", F("eval_predictions") == "fp")
    )

    # Visualize results in the App
    session = fo.launch_app(view=view)

.. image:: ../images/evaluation/quickstart_evaluate_detections.gif
   :alt: quickstart-evaluate-detections
   :align: center

Notice anything wrong? The sample with the most false positives is a plate of
carrots where the entire plate has been boxed as a single example in the ground
truth while the model is generating predictions for individual carrots!

If you're familiar with `COCO format <https://cocodataset.org/#format-data>`_
(which is respected by default by the
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method), you'll recognize that the issue here is that the `iscrowd` attribute
of this particular ground truth annotation has been incorrectly set to `0`.
Resolving mistakes like these will provide a much more accurate picture of the
real performance of a model.

Managing evaluations
--------------------

When you run an evaluation with an ``eval_key`` argument, the evaluation is
recorded on the dataset and you can retrieve information about it later, delete
it, or even :ref:`retrieve the view you evaluated on <load-evaluation-view>`:

.. code-block:: python
    :linenos:

    # List evaluations you've run on a dataset
    dataset.list_evaluations()
    # ['eval_predictions']

    # Print information about an evaluation
    print(dataset.get_evaluation_info("eval_predictions")

    # Delete the evaluation
    # This will remove any evaluation data that was populated on your dataset
    print(dataset.delete_evaluation("eval_predictions"))

The sections below discuss evaluating various types of predictions in more
detail.

.. _evaluating-classifications:

Classifications
_______________

You can use the
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
method to evaluate the predictions of a classifier.

By default, the classifications will be treated as a generic multiclass
classification task, but you can specify other evaluation strategies such as
top-k accuracy or binary evaluation.

Simple (default)
----------------

By default,
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
will treat your classifications as generic multiclass predictions, and it will
evaluate each prediction by directly comparing its ``label`` to the ``label``
of the associated ground truth prediction.

You can explicitly request that simple evaluation be used by setting the
``method`` parameter to ``"simple"``.

When you specify an ``eval_key`` parameter, a boolean ``eval_key`` field will
be populated on each sample that records whether that sample's prediction is
correct.

The example below demonstrates simple evaluation on an image dataset from the
:ref:`Dataset Zoo <fiftyone-model-zoo>`, adds some predictions via a
pre-trained model from the :ref:`Model Zoo <fiftyone-model-zoo>` to a subset of
the dataset, and then evaluates the predictions:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    # Load a small sample from the ImageNet dataset
    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name()
    )

    # Add predictions to 25 random samples
    predictions_view = dataset.take(25)
    model = foz.load_zoo_model("resnet50-imagenet-torch")
    predictions_view.apply_model(model, "predictions")

    # Evaluate the predictions in the `predictions` field with respect to the
    # labels in the `ground_truth` field
    results = predictions_view.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_simple",
    )

    # Get the 10 most common classes in the view
    counts = predictions_view.count_values("ground_truth.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    results.print_report(classes=classes)

    # Launch the App to explore
    session = fo.launch_app(dataset)

    # View only the incorrect predictions in the App
    session.view = predictions_view.match(F("eval_simple") == False)

Top-k evaluation
----------------

Set the ``method`` parameter of
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
to ``top-k`` in order to use top-k matching to evaluate your classifications.

Under this strategy, predictions are deemed to be correct if the corresponding
ground truth label is within the top ``k`` predictions.

When you specify an ``eval_key`` parameter, a boolean ``eval_key`` field will
be populated on each sample that records whether that sample's prediction is
correct.

.. note::

    In order to use top-k evaluation, you must populate the ``logits`` field
    of your predictions, and you must provide the list of corresponding class
    labels via the ``classes`` parameter of
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`.

The example below demonstrates top-k evaluation on an image dataset from the
:ref:`Dataset Zoo <fiftyone-model-zoo>` with predictions from a pre-trained
model from the :ref:`Model Zoo <fiftyone-model-zoo>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    # Load a small sample from the ImageNet dataset
    dataset = foz.load_zoo_dataset(
        "imagenet-sample",
        dataset_name=fo.get_default_dataset_name()
    )

    # We need the list of class labels corresponding to the logits
    logits_classes = dataset.info["classes"]

    # Add predictions (with logits) to 25 random samples
    predictions_view = dataset.take(25)
    model = foz.load_zoo_model("resnet50-imagenet-torch")
    predictions_view.apply_model(model, "predictions", store_logits=True)

    # Evaluate the predictions in the `predictions` field with respect to the
    # labels in the `ground_truth` field using top-5 matching
    results = predictions_view.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_top_k",
        method="top-k",
        classes=logits_classes,
        k=5,
    )

    # Get the 10 most common classes in the view
    counts = predictions_view.count_values("ground_truth.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    results.print_report(classes=classes)

    # Launch the App to explore
    session = fo.launch_app(dataset)

    # View only the incorrect predictions in the App
    session.view = predictions_view.match(F("eval_top_k") == False)

Binary evaluation
-----------------

If your classifier is binary, set the ``method`` parameter of
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
to ``binary`` in order to access binary-specific evaluation information such
as precision-recall curves for your model.

When you specify an ``eval_key`` parameter, a string ``eval_key`` field will
be populated on each sample that records whether the sample is a true positive,
false positive, true negative, or false negative.

.. note::

    In order to use binary evaluation, you must provide the
    ``(neg_label, pos_label)`` for your model via the ``classes`` parameter of
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`.

.. _evaluating-detections:

Detections
__________

You can use the
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method to evaluate the predictions of an object detection model.

.. note::

    Currently, COCO-style evaluation is the only option, but additional methods
    are coming soon!

COCO-style evaluation (default)
-------------------------------

.. _evaluating-detections:

Semantic segmentations
______________________

You can use the
:meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
method to evaluate the predictions of a semantic segmentation model.

Simple (default)
----------------

.. _evaluation-advanced:

Advanced usage
______________

.. _evaluating-views:

Evaluating views into your dataset
----------------------------------

All evaluation methods are exposed on |DatasetView| objects, which means that
you can define arbitrarily complex views into your datasets and run evaluation
on those.

For example, the snippet below evaluates only the medium-sized objects in a
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset(
        "quickstart",
        dataset_name=fo.get_default_dataset_name(),
    )
    dataset.compute_metadata()

    # Create an expression that will match objects whose bounding boxes have
    # areas between 32^2 and 96^2 pixels
    bbox_area = (
        F("$metadata.width") * F("bounding_box")[2] *
        F("$metadata.height") * F("bounding_box")[3]
    )
    medium_boxes = (32 ** 2 < bbox_area) & (bbox_area < 96 ** 2)

    # Create a view that contains only medium-sized objects
    medium_view = (
        dataset
        .filter_labels("ground_truth", medium_boxes)
        .filter_labels("predictions", medium_boxes)
    )

    # Evaluate the medium-sized objects
    results = medium_view.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_medium",
    )

    # Print some aggregate metrics
    print(results.metrics())

    # View results in the App
    session = fo.launch_app(view=medium_view)

.. note::

    If you run evaluation on a complex view, don't worry, you can always
    :ref:`load the view later <load-evaluation-view>`!

.. _load-evaluation-view:

Loading a previous evaluation result
------------------------------------

You can view a list of evaluation keys for evaluations that you have previously
run on a dataset via
:meth:`list_evaluations() <fiftyone.core.collections.SampleCollection.list_evaluations>`.

Evaluation keys are stored at the dataset-level, but if a particular evaluation
was run on a view into your dataset, you can use
:meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
to retrieve the exact view on which you evaluated:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset(...)

    # List available evaluations
    dataset.list_evaluations()
    # ["my_eval1", "my_eval2", ...]

    # Load the view into the dataset on which `my_eval1` was run
    eval1_view = dataset.load_evaluation_view("my_eval1")

.. note::

    If you have run multiple evaluations on a dataset, you can use the
    `select_fields` parameter of the
    :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
    method to hide any fields that were populated by other evaluation runs,
    allowing you to, for example, focus on a specific set of evaluation results
    in the App:

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        # Load a view that contains the results of evaluation `my_eval1` and
        # hides all other evaluation data
        eval1_view = dataset.load_evaluation_view("my_eval1", select_fields=True)

        fo.launch_app(view=eval1_view)

.. _evaluating-frame-labels:

Evaluating frame labels
-----------------------

All evaluation methods can be applied to frame-level labels in addition to
sample-level labels.

In order to evaluate frame-level labels of a video dataset, simply prepend
``frames.`` to the names of the relevant fields.

You can evaluate frame-level labels of a video dataset by adding the ``frames``
prefix to the relevant prediction and ground truth frame fields.

The example below demonstrates

.. note::

    When evaluating frame-level labels, helpful statistics are tabulated at
    both the sample- and frame-levels of your dataset. Refer to the
    documentation of the relevant evaluation method for more details.

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "quickstart-video",
        dataset_name=fo.get_default_dataset_name()
    )

    dataset.rename_frame_field("ground_truth_detections", "ground_truth")

    #
    # Create some test predictions by copying the ground truth objects into a
    # new `predictions` field of the frames and then perterbing 10% of the
    # labels at random
    #

    dataset.clone_frame_field("ground_truth", "predictions")

    classes = dataset.distinct("frames.ground_truth.detections.label")

    def jitter(val):
        if isinstance(val, list):
            return [jitter(v) for v in val]

        if random.random() < 0.10:
            return random.choice(classes)

        return val

    values = dataset.values("frames.ground_truth.detections.label")
    dataset.set_values("frames.predictions.detections.label", jitter(values))

    #
    # Evaluate the frame-level `predictions` against the frame-level
    # `ground_truth` objects
    #

    results = dataset.evaluate_detections(
        "frames.predictions",
        gt_field="frames.ground_truth",
        eval_key="eval_frames",
    )

    # Print a classification report
    results.print_report()

.. code-block:: text

                  precision    recall  f1-score   support

          person       0.76      0.93      0.84      1108
       road sign       0.90      0.94      0.92      2726
         vehicle       0.98      0.94      0.96      7511

       micro avg       0.94      0.94      0.94     11345
       macro avg       0.88      0.94      0.91     11345
    weighted avg       0.94      0.94      0.94     11345
