.. _evaluation-advanced:

Advanced Evaluation Usage
===========================

.. default-role:: code

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

    dataset = foz.load_zoo_dataset("quickstart", dataset_name="eval-demo")
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

    print(medium_view)

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

        import fiftyone as fo

        dataset = fo.load_dataset(...)

        # Load a view that contains the results of evaluation `my_eval1` and
        # hides all other evaluation data
        eval1_view = dataset.load_evaluation_view("my_eval1", select_fields=True)

        session = fo.launch_app(view=eval1_view)

.. _evaluating-videos:

Evaluating videos
-----------------

.. customavailablein::
    :oss_version: 0.11.2
    :enterprise_version: 1.0

All evaluation methods can be applied to frame-level labels in addition to
sample-level labels.

You can evaluate frame-level labels of a video dataset by adding the ``frames``
prefix to the relevant prediction and ground truth frame fields.

.. note::

    When evaluating frame-level labels, helpful statistics are tabulated at
    both the sample- and frame-levels of your dataset. Refer to the
    documentation of the relevant evaluation method for more details.

The example below demonstrates evaluating (mocked) frame-level detections on
the :ref:`quickstart-video dataset <dataset-zoo-quickstart-video>` from the
Dataset Zoo:

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset(
        "quickstart-video", dataset_name="video-eval-demo"
    )

    #
    # Create some test predictions by copying the ground truth objects into a
    # new `predictions` field of the frames with 10% of the labels perturbed at
    # random
    #

    classes = dataset.distinct("frames.detections.detections.label")

    def jitter(val):
        if random.random() < 0.10:
            return random.choice(classes)

        return val

    predictions = []
    for sample_gts in dataset.values("frames.detections"):
        sample_predictions = []
        for frame_gts in sample_gts:
            sample_predictions.append(
                fo.Detections(
                    detections=[
                        fo.Detection(
                            label=jitter(gt.label),
                            bounding_box=gt.bounding_box,
                            confidence=random.random(),
                        )
                        for gt in frame_gts.detections
                    ]
                )
            )

        predictions.append(sample_predictions)

    dataset.set_values("frames.predictions", predictions)

    print(dataset)

    # Evaluate the frame-level `predictions` against the frame-level
    # `detections` objects
    results = dataset.evaluate_detections(
        "frames.predictions",
        gt_field="frames.detections",
        eval_key="eval",
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

You can also view frame-level evaluation results as
:ref:`evaluation patches <evaluation-patches>` by first converting
:ref:`to frames <frame-views>` and then :ref:`to patches <eval-patches-views>`!

.. code-block:: python
    :linenos:

    # Convert to frame evaluation patches
    frames = dataset.to_frames(sample_frames=True)
    frame_eval_patches = frames.to_evaluation_patches("eval")
    print(frame_eval_patches)

    print(frame_eval_patches.count_values("type"))
    # {'tp': 10578, 'fn': 767, 'fp': 767}

    session = fo.launch_app(view=frame_eval_patches)

.. code-block:: text

    Dataset:     video-eval-demo
    Media type:  image
    Num patches: 12112
    Patch fields:
        id:               fiftyone.core.fields.ObjectIdField
        sample_id:        fiftyone.core.fields.ObjectIdField
        frame_id:         fiftyone.core.fields.ObjectIdField
        filepath:         fiftyone.core.fields.StringField
        frame_number:     fiftyone.core.fields.FrameNumberField
        tags:             fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:         fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.ImageMetadata)
        created_at:       fiftyone.core.fields.DateTimeField
        last_modified_at: fiftyone.core.fields.DateTimeField
        predictions:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        detections:       fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        type:             fiftyone.core.fields.StringField
        iou:              fiftyone.core.fields.FloatField
        crowd:            fiftyone.core.fields.BooleanField
    View stages:
        1. ToFrames(config=None)
        2. ToEvaluationPatches(eval_key='eval', config=None)

.. _custom-evaluation-metrics:

Custom evaluation metrics
-------------------------

.. customavailablein::
    :oss_version: 1.3.0
    :enterprise_version: 2.5.0

You can add custom metrics to your evaluation runs in FiftyOne.

Custom metrics are supported by all FiftyOne evaluation methods, and you can
compute them via the SDK, or directly
:ref:`from the App <model-evaluation-panel>` if you're running
:ref:`FiftyOne Enterprise <fiftyone-enterprise>`.

Using custom metrics
~~~~~~~~~~~~~~~~~~~~

The example below shows how to compute a custom metric from the
`metric-examples <https://github.com/voxel51/fiftyone-plugins/tree/main/plugins/metric-examples>`_
plugin when evaluating object detections:

.. code-block:: shell

    # Install the example metrics plugin
    fiftyone plugins download \
        https://github.com/voxel51/fiftyone-plugins \
        --plugin-names @voxel51/metric-examples

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Custom metrics are specified via their operator URI
    metric_uri = "@voxel51/metric-examples/example_metric"

    # Custom metrics can optionally accept kwargs that configure their behavior
    metric_kwargs = dict(value="spam")

    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
        custom_metrics={metric_uri: metric_kwargs},
    )

    # Custom metrics may populate new fields on each sample
    dataset.count_values("eval_example_metric")
    # {'spam': 200}

    # Custom metrics may also compute an aggregate value, which is included in
    # the run's metrics report
    results.print_metrics()
    """
    accuracy   0.25
    precision  0.26
    recall     0.86
    fscore     0.40
    support    1735
    example    spam  # the custom metric
    """

    #
    # Launch the app
    #
    # Open the Model Evaluation panel and you'll see the "Example metric" in
    # the Summary table
    #
    session = fo.launch_app(dataset)

    # Deleting an evaluation automatically deletes any custom metrics
    # associated with it
    dataset.delete_evaluation("eval")
    assert not dataset.has_field("eval_example_metric")

.. image:: /images/evaluation/custom-evaluation-metric.png
    :alt: custom-evaluation-metric
    :align: center

When using metric operators without custom parameters, you can also pass a list
of operator URI's to the `custom_metrics` parameter:

.. code-block:: python
    :linenos:

    # Apply two custom metrics to a regression evaluation
    results = dataset.evaluate_regressions(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
        custom_metrics=[
            "@voxel51/metric-examples/absolute_error",
            "@voxel51/metric-examples/squared_error",
        ],
    )

You can also add custom metrics to an existing evaluation at any time via
:meth:`add_custom_metrics() <fiftyone.utils.eval.base.BaseEvaluationResults.add_custom_metrics>`:

.. code-block:: python
    :linenos:

    # Load an existing evaluation run
    results = dataset.load_evaluation_results("eval")

    # Add some custom metrics
    results.add_custom_metrics(
        [
            "@voxel51/metric-examples/absolute_error",
            "@voxel51/metric-examples/squared_error",
        ]
    )

Developing custom metrics
~~~~~~~~~~~~~~~~~~~~~~~~~

Each custom metric is implemented as an :ref:`operator <developing-operators>`
that implements the
:class:`EvaluationMetric <fiftyone.operators.evaluation_metric.EvaluationMetric>`
interface.

Let's look at an example evaluation metric operator:

.. code-block:: python
    :linenos:

    import fiftyone.operators as foo
    from fiftyone.operators import types

    class ExampleMetric(foo.EvaluationMetric):
        @property
        def config(self):
            return foo.EvaluationMetricConfig(
                # The metric's URI: f"{plugin_name}/{name}"
                name="example_metric",  # required

                # The display name of the metric in the Summary table of the
                # Model Evaluation panel
                label="Example metric",  # required

                # A description for the operator
                description="An example evaluation metric",  # optional

                # List of evaluation types that the metrics supports
                # EG: ["regression", "classification", "detection", ...]
                # If omitted, the metric may be applied to any evaluation
                eval_types=None,  # optional

                # An optional custom key under which the metric's aggregate
                # value is stored and returned in methods like `metrics()`
                # If omitted, the metric's `name` is used
                aggregate_key="example",  # optional

                # Metrics are generally not designed to be directly invoked
                # via the Operator browser, so they should be unlisted
                unlisted=True,  # required
            )

        def resolve_input(self, ctx, inputs):
            """You can optionally implement this method to collect user input
            for the metric's parameters in the App.

            Returns:
                a :class:`fiftyone.operators.types.Property`, or None
            """
            inputs = types.Object()
            inputs.str(
                "value",
                label="Example value",
                description="The example value to store/return",
                default="foo",
                required=True,
            )
            return types.Property(inputs)

        def compute(self, samples, results, value="foo"):
            """All metric operators must implement this method. It defines the
            computation done by the metric and which per-frame and/or
            per-sample fields store the computed value.

            This method can return None or the aggregate metric value. The
            aggregrate metric value is included in the result's `metrics()`
            and displayed in the Summary table of the Model Evaluation panel.
            """
            dataset = samples._dataset
            eval_key = results.key
            metric_field = f"{eval_key}_{self.config.name}"
            dataset.add_sample_field(metric_field, fo.StringField)
            samples.set_field(metric_field, value).save()

            return value

        def get_fields(self, samples, config, eval_key):
            """Lists the fields that were populated by the evaluation metric
            with the given key, if any.
            """
            return [f"{eval_key}_{self.config.name}"]

.. note::

    By convention, evaluation metrics should include `f"{eval_key}"` in any
    sample fields that they populate. If your metric populates fields whose
    names do not contain the evaluation key, then you must also implement
    :meth:`rename() <fiftyone.operators.evaluation_metric.EvaluationMetric.rename>`
    and
    :meth:`cleanup() <fiftyone.operators.evaluation_metric.EvaluationMetric.cleanup>`
    so that they are properly handled when renaming/deleting evaluation runs.

.. _custom-evaluation-backends:

Custom evaluation backends
--------------------------

.. customavailablein::
    :oss_version: 0.23.0
    :enterprise_version: 1.5.0

If you would like to use an evaluation protocol that is not natively supported
by FiftyOne, you can follow the instructions below to implement an interface
for your protocol and then configure your environment so that FiftyOne's
evaluation methods will use it.

.. tabs::

  .. group-tab:: Regression

    You can define custom regression evaluation backends that can be used by
    passing the `method` parameter to
    :meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`:

    .. code:: python
        :linenos:

        view.evaluate_regressions(..., method="<backend>", ...)

    Regression evaluation backends are defined by writing subclasses of the
    following two classes:

    -   :class:`RegressionEvaluation <fiftyone.utils.eval.regression.RegressionEvaluation>`:
        this class implements the evaluation protocol itself. Specifically you
        should implement
        :meth:`evaluate_samples() <fiftyone.utils.eval.regression.RegressionEvaluation.evaluate_samples>`,
        which accepts a sample collection to evaluate as input and returns a
        :class:`RegressionResults <fiftyone.utils.eval.regression.RegressionResults>`
        instance that contains the results of the evaluation

    -   :class:`RegressionEvaluationConfig <fiftyone.utils.eval.regression.RegressionEvaluationConfig>`:
        this class defines the available parameters that users can pass as
        keyword arguments to
        :meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`
        to customize the behavior of the evaluation run

    If desired, you can also implement and return a custom
    :class:`RegressionResults <fiftyone.utils.eval.regression.RegressionResults>`
    subclass. This is useful if you want to expose custom methods that users
    can call to view and/or interact with the evaluation results
    programmatically.

    The recommended way to expose a custom regression evaluation method is to
    add it to your :ref:`evaluation config <evaluation-config>` at
    `~/.fiftyone/evaluation_config.json` as follows:

    .. code-block:: text

        {
            "default_regression_backend": "<backend>",
            "regression_backends": {
                "<backend>": {
                    "config_cls": "your.custom.RegressionEvaluationConfig"
                }
            },
            ...
        }

    In the above, `<backend>` defines the name of your custom backend, which
    you can henceforward pass as the `method` parameter to
    :meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`,
    and the `config_cls` parameter specifies the fully-qualified name of the
    :class:`RegressionEvaluationConfig <fiftyone.utils.eval.regression.RegressionEvaluationConfig>`
    subclass for your evaluation backend.

    With the optional `default_regression_backend` parameter set to your custom
    backend as shown above, calling
    :meth:`evaluate_regressions() <fiftyone.core.collections.SampleCollection.evaluate_regressions>`
    will automatically use your backend.

  .. group-tab:: Classification

    You can define custom classification evaluation backends that can be used
    by passing the `method` parameter to
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`:

    .. code:: python
        :linenos:

        view.evaluate_classifications(..., method="<backend>", ...)

    Classification evaluation backends are defined by writing subclasses of the
    following two classes:

    -   :class:`ClassificationEvaluation <fiftyone.utils.eval.classification.ClassificationEvaluation>`:
        this class implements the evaluation protocol itself. Specifically you
        should implement
        :meth:`evaluate_samples() <fiftyone.utils.eval.classification.ClassificationEvaluation.evaluate_samples>`,
        which accepts a sample collection to evaluate as input and returns a
        :class:`ClassificationResults <fiftyone.utils.eval.classification.ClassificationResults>`
        instance that contains the results of the evaluation

    -   :class:`ClassificationEvaluationConfig <fiftyone.utils.eval.classification.ClassificationEvaluationConfig>`:
        this class defines the available parameters that users can pass as
        keyword arguments to
        :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
        to customize the behavior of the evaluation run

    If desired, you can also implement and return a custom
    :class:`ClassificationResults <fiftyone.utils.eval.classification.ClassificationResults>`
    subclass. This is useful if you want to expose custom methods that users
    can call to view and/or interact with the evaluation results
    programmatically.

    The recommended way to expose a custom classification evaluation method is
    to add it to your :ref:`evaluation config <evaluation-config>` at
    `~/.fiftyone/evaluation_config.json` as follows:

    .. code-block:: text

        {
            "default_classification_backend": "<backend>",
            "classification_backends": {
                "<backend>": {
                    "config_cls": "your.custom.ClassificationEvaluationConfig"
                }
            },
            ...
        }

    In the above, `<backend>` defines the name of your custom backend, which
    you can henceforward pass as the `method` parameter to
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`,
    and the `config_cls` parameter specifies the fully-qualified name of the
    :class:`ClassificationEvaluationConfig <fiftyone.utils.eval.classification.ClassificationEvaluationConfig>`
    subclass for your evaluation backend.

    With the optional `default_classification_backend` parameter set to your
    custom backend as shown above, calling
    :meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`
    will automatically use your backend.

  .. group-tab:: Detection

    You can define custom detection evaluation backends that can be used by
    passing the `method` parameter to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

    .. code:: python
        :linenos:

        view.evaluate_detections(..., method="<backend>", ...)

    Detection evaluation backends are defined by writing subclasses of the
    following two classes:

    -   :class:`DetectionEvaluation <fiftyone.utils.eval.detection.DetectionEvaluation>`:
        this class implements the evaluation protocol itself. Specifically you
        should implement
        :meth:`evaluate() <fiftyone.utils.eval.detection.DetectionEvaluation.evaluate>`,
        which accepts a sample to evaluate as input and returns a list of
        matched ground truth/predicted object pairs, and you can optionally
        implement
        :meth:`generate_results() <fiftyone.utils.eval.detection.DetectionEvaluation.generate_results>`,
        to compute aggregate evaluation results (e.g., mAP or PR curves) for
        the sample collection and return them in a
        :class:`DetectionResults <fiftyone.utils.eval.detection.DetectionResults>`
        instance

    -   :class:`DetectionEvaluationConfig <fiftyone.utils.eval.detection.DetectionEvaluationConfig>`:
        this class defines the available parameters that users can pass as
        keyword arguments to
        :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
        to customize the behavior of the evaluation run

    If desired, you can also implement and return a custom
    :class:`DetectionResults <fiftyone.utils.eval.detection.DetectionResults>`
    subclass. This is useful if you want to expose custom methods that users
    can call to view and/or interact with the evaluation results
    programmatically.

    The recommended way to expose a custom detection evaluation method is to
    add it to your :ref:`evaluation config <evaluation-config>` at
    `~/.fiftyone/evaluation_config.json` as follows:

    .. code-block:: text

        {
            "default_detection_backend": "<backend>",
            "detection_backends": {
                "<backend>": {
                    "config_cls": "your.custom.DetectionEvaluationConfig"
                }
            },
            ...
        }

    In the above, `<backend>` defines the name of your custom backend, which
    you can henceforward pass as the `method` parameter to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`,
    and the `config_cls` parameter specifies the fully-qualified name of the
    :class:`DetectionEvaluationConfig <fiftyone.utils.eval.detection.DetectionEvaluationConfig>`
    subclass for your evaluation backend.

    With the optional `default_detection_backend` parameter set to your
    custom backend as shown above, calling
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
    will automatically use your backend.

  .. group-tab:: Segmentation

    You can define custom segmentation evaluation backends that can be used by
    passing the `method` parameter to
    :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`:

    .. code:: python
        :linenos:

        view.evaluate_segmentations(..., method="<backend>", ...)

    Segmentation evaluation backends are defined by writing subclasses of the
    following two classes:

    -   :class:`SegmentationEvaluation <fiftyone.utils.eval.segmentation.SegmentationEvaluation>`:
        this class implements the evaluation protocol itself. Specifically you
        should implement
        :meth:`evaluate_samples() <fiftyone.utils.eval.segmentation.SegmentationEvaluation.evaluate_samples>`,
        which accepts a sample collection to evaluate as input and returns a
        :class:`SegmentationResults <fiftyone.utils.eval.segmentation.SegmentationResults>`
        instance that contains the results of the evaluation

    -   :class:`SegmentationEvaluationConfig <fiftyone.utils.eval.segmentation.SegmentationEvaluationConfig>`:
        this class defines the available parameters that users can pass as
        keyword arguments to
        :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
        to customize the behavior of the evaluation run

    If desired, you can also implement and return a custom
    :class:`SegmentationResults <fiftyone.utils.eval.segmentation.SegmentationResults>`
    subclass. This is useful if you want to expose custom methods that users
    can call to view and/or interact with the evaluation results
    programmatically.

    The recommended way to expose a custom segmentation evaluation method is to
    add it to your :ref:`evaluation config <evaluation-config>` at
    `~/.fiftyone/evaluation_config.json` as follows:

    .. code-block:: text

        {
            "default_segmentation_backend": "<backend>",
            "segmentation_backends": {
                "<backend>": {
                    "config_cls": "your.custom.SegmentationEvaluationConfig"
                }
            },
            ...
        }

    In the above, `<backend>` defines the name of your custom backend, which
    you can henceforward pass as the `method` parameter to
    :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`,
    and the `config_cls` parameter specifies the fully-qualified name of the
    :class:`SegmentationEvaluationConfig <fiftyone.utils.eval.segmentation.SegmentationEvaluationConfig>`
    subclass for your evaluation backend.

    With the optional `default_segmentation_backend` parameter set to your
    custom backend as shown above, calling
    :meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
    will automatically use your backend.

.. _evaluation-config:

Evaluation config
-----------------

FiftyOne provides an evaluation config that you can use to either temporarily
or permanently configure the behavior of the evaluation API.

Viewing your config
~~~~~~~~~~~~~~~~~~~

You can print your current evaluation config at any time via the Python library
and the CLI:

.. tabs::

  .. tab:: Python

    .. code-block:: python

        import fiftyone as fo

        # Print your current evaluation config
        print(fo.evaluation_config)

    .. code-block:: text

        {
            "default_regresion_backend": "simple",
            "default_classification_backend": "simple",
            "default_detection_backend": "coco",
            "default_segmentation_backend": "simple",
            "regression_backends": {
                "simple": {
                    "config_cls": "fiftyone.utils.eval.regression.SimpleEvaluationConfig"
                }
            },
            "classification_backends": {
                "binary": {
                    "config_cls": "fiftyone.utils.eval.classification.BinaryEvaluationConfig"
                },
                "simple": {
                    "config_cls": "fiftyone.utils.eval.classification.SimpleEvaluationConfig"
                },
                "top-k": {
                    "config_cls": "fiftyone.utils.eval.classification.TopKEvaluationConfig"
                }
            },
            "detection_backends": {
                "activitynet": {
                    "config_cls": "fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig"
                },
                "coco": {
                    "config_cls": "fiftyone.utils.eval.coco.COCOEvaluationConfig"
                },
                "open-images": {
                    "config_cls": "fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig"
                }
            },
            "segmentation_backends": {
                "simple": {
                    "config_cls": "fiftyone.utils.eval.segmentation.SimpleEvaluationConfig"
                }
            }
        }

  .. tab:: CLI

    .. code-block:: shell

        # Print your current evaluation config
        fiftyone evaluation config

    .. code-block:: text

        {
            "default_regresion_backend": "simple",
            "default_classification_backend": "simple",
            "default_detection_backend": "coco",
            "default_segmentation_backend": "simple",
            "regression_backends": {
                "simple": {
                    "config_cls": "fiftyone.utils.eval.regression.SimpleEvaluationConfig"
                }
            },
            "classification_backends": {
                "binary": {
                    "config_cls": "fiftyone.utils.eval.classification.BinaryEvaluationConfig"
                },
                "simple": {
                    "config_cls": "fiftyone.utils.eval.classification.SimpleEvaluationConfig"
                },
                "top-k": {
                    "config_cls": "fiftyone.utils.eval.classification.TopKEvaluationConfig"
                }
            },
            "detection_backends": {
                "activitynet": {
                    "config_cls": "fiftyone.utils.eval.activitynet.ActivityNetEvaluationConfig"
                },
                "coco": {
                    "config_cls": "fiftyone.utils.eval.coco.COCOEvaluationConfig"
                },
                "open-images": {
                    "config_cls": "fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig"
                }
            },
            "segmentation_backends": {
                "simple": {
                    "config_cls": "fiftyone.utils.eval.segmentation.SimpleEvaluationConfig"
                }
            }
        }

.. note::

    If you have customized your evaluation config via any of the methods
    described below, printing your config is a convenient way to ensure that
    the changes you made have taken effect as you expected.

Modifying your config
~~~~~~~~~~~~~~~~~~~~~

You can modify your evaluation config in a variety of ways. The following
sections describe these options in detail.

Order of precedence
^^^^^^^^^^^^^^^^^^^

The following order of precedence is used to assign values to your evaluation
config settings as runtime:

1. Config settings applied at runtime by directly editing
   `fiftyone.evaluation_config`
2. `FIFTYONE_XXX` environment variables
3. Settings in your JSON config (`~/.fiftyone/evaluation_config.json`)
4. The default config values

Editing your JSON config
^^^^^^^^^^^^^^^^^^^^^^^^

You can permanently customize your evaluation config by creating a
`~/.fiftyone/evaluation_config.json` file on your machine. The JSON file may
contain any desired subset of config fields that you wish to customize.

For example, the following config JSON file declares a new `custom` detection
evaluation backend without changing any other default config settings:

.. code-block:: json

    {
        "default_detection_backend": "custom",
        "detection_backends": {
            "custom": {
                "config_cls": "path.to.your.CustomDetectionEvaluationConfig"
            }
        }
    }

When `fiftyone` is imported, any options from your JSON config are merged into
the default config, as per the order of precedence described above.

.. note::

    You can customize the location from which your JSON config is read by
    setting the `FIFTYONE_EVALUATION_CONFIG_PATH` environment variable.

Setting environment variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

Evaluation config settings may be customized on a per-session basis by setting
the `FIFTYONE_<TYPE>_XXX` environment variable(s) for the desired config
settings, where `<TYPE>` can be `REGRESSION`, `CLASSIFICATION`, `DETECTION`, or
`SEGMENTATION`.

The `FIFTYONE_DEFAULT_<TYPE>_BACKEND` environment variables allows you to
configure your default backend:

.. code-block:: shell

    export FIFTYONE_DEFAULT_DETECTION_BACKEND=coco

You can declare parameters for specific evaluation backends by setting
environment variables of the form `FIFTYONE_<TYPE>_<BACKEND>_<PARAMETER>`. Any
settings that you declare in this way will be passed as keyword arguments to
methods like
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
whenever the corresponding backend is in use:

.. code-block:: shell

    export FIFTYONE_DETECTION_COCO_ISCROWD=is_crowd

The `FIFTYONE_<TYPE>_BACKENDS` environment variables can be set to a
`list,of,backends` that you want to expose in your session, which may exclude
native backends and/or declare additional custom backends whose parameters are
defined via additional config modifications of any kind:

.. code-block:: shell

    export FIFTYONE_DETECTION_BACKENDS=custom,coco,open-images

When declaring new backends, you can include `*` to append new backend(s)
without omitting or explicitly enumerating the builtin backends. For example,
you can add a `custom` detection evaluation backend as follows:

.. code-block:: shell

    export FIFTYONE_DETECTION_BACKENDS=*,custom
    export FIFTYONE_DETECTION_CUSTOM_CONFIG_CLS=your.custom.DetectionEvaluationConfig

Modifying your config in code
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

You can dynamically modify your evaluation config at runtime by directly
editing the `fiftyone.evaluation_config` object.

Any changes to your evaluation config applied via this manner will immediately
take effect in all subsequent calls to `fiftyone.evaluation_config` during your
current session.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    fo.evaluation_config.default_detection_backend = "custom"
