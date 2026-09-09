.. _evaluating-classifications:

Evaluating Classifications
===========================

.. default-role:: code

.. customavailablein::
    :oss_version: 0.7.3
    :enterprise_version: 1.0

You can use the
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
method to evaluate the predictions of a classifier stored in a
|Classification| field of your dataset.

By default, the classifications will be treated as a generic multiclass
classification task, but you can specify other evaluation strategies such as
top-k accuracy or binary evaluation via the ``method`` parameter.

Invoking
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
returns a |ClassificationResults| instance that provides a variety of methods
for generating various aggregate evaluation reports about your model.

In addition, when you specify an ``eval_key`` parameter, a number of helpful
fields will be populated on each sample that you can leverage via the
:ref:`FiftyOne App <fiftyone-app>` to interactively explore the strengths and
weaknesses of your model on individual samples.

Simple evaluation (default)
---------------------------

By default,
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
will treat your classifications as generic multiclass predictions, and it will
evaluate each prediction by directly comparing its ``label`` to the associated
ground truth prediction.

You can explicitly request that simple evaluation be used by setting the
``method`` parameter to ``"simple"``.

When you specify an ``eval_key`` parameter, a boolean ``eval_key`` field will
be populated on each sample that records whether that sample's prediction is
correct.

The example below demonstrates simple evaluation on the
:ref:`CIFAR-10 dataset <dataset-zoo-cifar10>` with some fake predictions added
to it to demonstrate the workflow:

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset(
        "cifar10",
        split="test",
        max_samples=1000,
        shuffle=True,
    )

    #
    # Create some test predictions by copying the ground truth labels into a
    # new `predictions` field with 10% of the labels perturbed at random
    #

    classes = dataset.distinct("ground_truth.label")

    def jitter(val):
        if random.random() < 0.10:
            return random.choice(classes)

        return val

    predictions = [
        fo.Classification(label=jitter(gt.label), confidence=random.random())
        for gt in dataset.values("ground_truth")
    ]

    dataset.set_values("predictions", predictions)

    print(dataset)

    # Evaluate the predictions in the `predictions` field with respect to the
    # labels in the `ground_truth` field
    results = dataset.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_simple",
    )

    # Print a classification report
    results.print_report()

    # Plot a confusion matrix
    plot = results.plot_confusion_matrix()
    plot.show()

    # Launch the App to explore
    session = fo.launch_app(dataset)

    # View only the incorrect predictions in the App
    session.view = dataset.match(F("eval_simple") == False)

.. code-block:: text

                  precision    recall  f1-score   support

        airplane       0.91      0.90      0.91       118
      automobile       0.93      0.90      0.91       101
            bird       0.93      0.87      0.90       103
             cat       0.92      0.91      0.92        94
            deer       0.88      0.92      0.90       116
             dog       0.85      0.84      0.84        86
            frog       0.85      0.92      0.88        84
           horse       0.88      0.91      0.89        96
            ship       0.93      0.95      0.94        97
           truck       0.92      0.89      0.90       105

        accuracy                           0.90      1000
       macro avg       0.90      0.90      0.90      1000
    weighted avg       0.90      0.90      0.90      1000

.. image:: /images/evaluation/cifar10_simple_confusion_matrix.png
   :alt: cifar10-simple-confusion-matrix
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

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

    Did you know? Many models from the :ref:`Model Zoo <model-zoo>`
    provide support for storing logits for their predictions!

The example below demonstrates top-k evaluation on a
:ref:`small ImageNet sample <dataset-zoo-imagenet-sample>` with predictions
from a pre-trained model from the :ref:`Model Zoo <model-zoo>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset(
        "imagenet-sample", dataset_name="top-k-eval-demo"
    )

    # We need the list of class labels corresponding to the logits
    logits_classes = dataset.default_classes

    # Add predictions (with logits) to 25 random samples
    predictions_view = dataset.take(25, seed=51)
    model = foz.load_zoo_model("resnet50-imagenet-torch")
    predictions_view.apply_model(model, "predictions", store_logits=True)

    print(predictions_view)

    # Evaluate the predictions in the `predictions` field with respect to the
    # labels in the `ground_truth` field using top-5 accuracy
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

    # View only the incorrect predictions for the 10 most common classes
    session.view = (
        predictions_view
        .match(F("ground_truth.label").is_in(classes))
        .match(F("eval_top_k") == False)
    )

.. image:: /images/evaluation/imagenet_top_k_eval.png
   :alt: imagenet-top-k-eval
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

Binary evaluation
-----------------

If your classifier is binary, set the ``method`` parameter of
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
to ``"binary"`` in order to access binary-specific evaluation information such
as precision-recall curves for your model.

When you specify an ``eval_key`` parameter, a string ``eval_key`` field will
be populated on each sample that records whether the sample is a true positive,
false positive, true negative, or false negative.

.. note::

    In order to use binary evaluation, you must provide the
    ``(neg_label, pos_label)`` for your model via the ``classes`` parameter of
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`.

The example below demonstrates binary evaluation on the
:ref:`CIFAR-10 dataset <dataset-zoo-cifar10>` with some fake binary predictions
added to it to demonstrate the workflow:

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load a small sample from the ImageNet dataset
    dataset = foz.load_zoo_dataset(
        "cifar10",
        split="test",
        max_samples=1000,
        shuffle=True,
    )

    #
    # Binarize the ground truth labels to `cat` and `other`, and add
    # predictions that are correct proportionally to their confidence
    #

    classes = ["other", "cat"]

    for sample in dataset:
        gt_label = "cat" if sample.ground_truth.label == "cat" else "other"

        confidence = random.random()
        if random.random() > confidence:
            pred_label = "cat" if gt_label == "other" else "other"
        else:
            pred_label = gt_label

        sample.ground_truth.label = gt_label
        sample["predictions"] = fo.Classification(
            label=pred_label, confidence=confidence
        )

        sample.save()

    print(dataset)

    # Evaluate the predictions in the `predictions` field with respect to the
    # labels in the `ground_truth` field
    results = dataset.evaluate_classifications(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval_binary",
        method="binary",
        classes=classes,
    )

    # Print a classification report
    results.print_report()

    # Plot a PR curve
    plot = results.plot_pr_curve()
    plot.show()

.. code-block:: text

                  precision    recall  f1-score   support

           other       0.90      0.48      0.63       906
             cat       0.09      0.50      0.15        94

        accuracy                           0.48      1000
       macro avg       0.50      0.49      0.39      1000
    weighted avg       0.83      0.48      0.59      1000

.. image:: /images/evaluation/cifar10_binary_pr_curve.png
   :alt: cifar10-binary-pr-curve
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

