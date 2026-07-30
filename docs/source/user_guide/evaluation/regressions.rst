.. _evaluating-regressions:

Evaluating Regressions
=======================

.. default-role:: code

You can use the
:meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`
method to evaluate the predictions of a regression model stored in a
|Regression| field of your dataset.

Invoking
:meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`
returns a |RegressionResults| instance that provides a variety of methods for
evaluating your model.

In addition, when you specify an ``eval_key`` parameter, helpful fields will be
populated on each sample that you can leverage via the
:ref:`FiftyOne App <fiftyone-app>` to interactively explore the strengths and
weaknesses of your model on individual samples.

Simple evaluation (default)
---------------------------

By default,
:meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`
will evaluate each prediction by directly comparing its ``value`` to the
associated ground truth value.

You can explicitly request that simple evaluation be used by setting the
``method`` parameter to ``"simple"``.

When you specify an ``eval_key`` parameter, a float ``eval_key`` field will be
populated on each sample that records the error of that sample's prediction
with respect to its ground truth value. By default, the squared error will be
computed, but you can customize this via the optional ``metric`` argument to
:meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`,
which can take any value supported by
:class:`SimpleEvaluationConfig <fiftyone.utils.eval.regression.SimpleEvaluationConfig>`.

The example below demonstrates simple evaluation on the
:ref:`quickstart dataset <dataset-zoo-quickstart>` with some fake regression
data added to it to demonstrate the workflow:

.. code-block:: python
    :linenos:

    import random
    import numpy as np

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart").select_fields().clone()

    # Populate some fake regression + weather data
    for idx, sample in enumerate(dataset, 1):
        ytrue = random.random() * idx
        ypred = ytrue + np.random.randn() * np.sqrt(ytrue)
        confidence = random.random()
        sample["ground_truth"] = fo.Regression(value=ytrue)
        sample["predictions"] = fo.Regression(value=ypred, confidence=confidence)
        sample["weather"] = random.choice(["sunny", "cloudy", "rainy"])
        sample.save()

    print(dataset)

    # Evaluate the predictions in the `predictions` field with respect to the
    # values in the `ground_truth` field
    results = dataset.evaluate_regressions(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
    )

    # Print some standard regression evaluation metrics
    results.print_metrics()

    # Plot a scatterplot of the results colored by `weather` and scaled by
    # `confidence`
    plot = results.plot_results(labels="weather", sizes="predictions.confidence")
    plot.show()

    # Launch the App to explore
    session = fo.launch_app(dataset)

    # Show the samples with the smallest regression error
    session.view = dataset.sort_by("eval")

    # Show the samples with the largest regression error
    session.view = dataset.sort_by("eval", reverse=True)

.. code-block:: text

    mean squared error        59.69
    root mean squared error   7.73
    mean absolute error       5.48
    median absolute error     3.57
    r2 score                  0.97
    explained variance score  0.97
    max error                 31.77
    support                   200

.. image:: /images/evaluation/regression_evaluation_plot.png
   :alt: regression-evaluation-plot
   :align: center

.. note::

    Did you know? You can
    :ref:`attach regression plots to the App <regression-plots>` and
    interactively explore them by selecting scatter points and/or modifying
    your view in the App.

