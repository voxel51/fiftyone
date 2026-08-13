.. _evaluating-detections:

Evaluating Detections
=======================

.. default-role:: code

.. customavailablein::
    :oss_version: 0.7.3
    :enterprise_version: 1.0

You can use the
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method to evaluate the predictions of an object detection model stored in a
|Detections|, |Polylines|, or |Keypoints| field of your dataset or of a
temporal detection model stored in a |TemporalDetections| field of your
dataset.

Invoking
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
returns a |DetectionResults| instance that provides a variety of methods for
generating various aggregate evaluation reports about your model.

In addition, when you specify an ``eval_key`` parameter, a number of helpful
fields will be populated on each sample and its predicted/ground truth
objects that you can leverage via the :ref:`FiftyOne App <fiftyone-app>` to
interactively explore the strengths and weaknesses of your model on individual
samples.

.. note::

    FiftyOne uses the :ref:`COCO-style <evaluating-detections-coco>` evaluation
    by default, but
    :ref:`Open Images-style <evaluating-detections-open-images>` evaluation is
    also natively supported.

.. _evaluation-detection-types:

Supported types
---------------

.. customavailablein::
    :oss_version: 0.11.2
    :enterprise_version: 1.0

The :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method supports all of the following task types:

-   :ref:`Object detection <object-detection>`
-   :ref:`Instance segmentations <instance-segmentation>`
-   :ref:`Polygon detection <polylines>`
-   :ref:`Keypoints <keypoints>`
-   :ref:`Temporal detections <temporal-detection>`
-   :ref:`3D detections <3d-detections>`

The only difference between each task type is in how the IoU between objects is
calculated:

-   For object detections, IoUs are computed between each pair of bounding boxes
-   For instance segmentations, when ``use_masks=True``, IoUs are computed
    between the dense pixel masks rather than their rectangular bounding boxes
-   For polygons, IoUs are computed between the polygonal shapes
-   For keypoint tasks,
    `object keypoint similarity <https://cocodataset.org/#keypoints-eval>`_
    is computed for each pair of objects, using the extent of the ground truth
    keypoints as a proxy for the area of the object's bounding box. By default,
    uniform falloff (:math:`\kappa`) is assumed, but you can provide
    `keypoint_sigmas` to customize the per-keypoint OKS falloff
-   For temporal detections, IoU is computed between the 1D support of two
    temporal segments

For object detection tasks, the ground truth and predicted objects should be
stored in |Detections| format.

For instance segmentation tasks, the ground truth and predicted objects should
be stored in |Detections| format, and each |Detection| instance should have its
mask populated to define the extent of the object within its bounding box.

.. note::

    In order to use instance masks for IoU calculations, pass ``use_masks=True``
    to :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`.

For polygon detection tasks, the ground truth and predicted objects should be
stored in |Polylines| format with their
:attr:`filled <fiftyone.core.labels.Polyline.filled>` attribute set to
``True`` to indicate that they represent closed polygons (as opposed to
polylines).

.. note::

    If you are evaluating polygons but would rather use bounding boxes rather
    than the actual polygonal geometries for IoU calculations, you can pass
    ``use_boxes=True`` to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`.

For keypoint tasks, each |Keypoint| instance must contain point arrays of equal
length and semantic ordering.

.. note::

    If a particular point is missing or not visible for a |Keypoint| instance,
    use nan values for its coordinates. :ref:`See here <keypoints>` for more
    information about structuring keypoints.

For temporal detection tasks, the ground truth and predicted objects should be
stored in |TemporalDetections| format.

.. _evaluation-patches:

Evaluation patches views
------------------------

Once you have run
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
on a dataset, you can use
:meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
to transform the dataset (or a view into it) into a new view that contains one
sample for each true positive, false positive, and false negative example.

True positive examples will result in samples with both their ground truth and
predicted fields populated, while false positive/negative examples will only
have one of their corresponding predicted/ground truth fields populated,
respectively.

If multiple predictions are matched to a ground truth object (e.g., if the
evaluation protocol includes a crowd attribute), then all matched predictions
will be stored in the single sample along with the ground truth object.

Evaluation patches views also have top-level ``type`` and ``iou`` fields
populated based on the evaluation results for that example, as well as a
``sample_id`` field recording the sample ID of the example, and a ``crowd``
field if the evaluation protocol defines a crowd attribute.

.. note::

    Evaluation patches views generate patches for **only** the contents of the
    current view, which may differ from the view on which the ``eval_key``
    evaluation was performed. This may exclude some labels that were evaluated
    and/or include labels that were not evaluated.

    If you would like to see patches for the exact view on which an
    evaluation was performed, first call
    :meth:`load_evaluation_view() <fiftyone.core.collections.SampleCollection.load_evaluation_view>`
    to load the view and then convert to patches.

The example below demonstrates loading an evaluation patches view for the
results of an evaluation on the
:ref:`quickstart dataset <dataset-zoo-quickstart>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Evaluate `predictions` w.r.t. labels in `ground_truth` field
    dataset.evaluate_detections(
        "predictions", gt_field="ground_truth", eval_key="eval"
    )

    session = fo.launch_app(dataset)

    # Convert to evaluation patches
    eval_patches = dataset.to_evaluation_patches("eval")
    print(eval_patches)

    print(eval_patches.count_values("type"))
    # {'fn': 246, 'fp': 4131, 'tp': 986}

    # View patches in the App
    session.view = eval_patches

.. code-block:: text

    Dataset:     quickstart
    Media type:  image
    Num patches: 5363
    Patch fields:
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.ImageMetadata)
        predictions:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        sample_id:    fiftyone.core.fields.StringField
        type:         fiftyone.core.fields.StringField
        iou:          fiftyone.core.fields.FloatField
        crowd:        fiftyone.core.fields.BooleanField
    View stages:
        1. ToEvaluationPatches(eval_key='eval', config=None)

.. note::

    Did you know? You can convert to evaluation patches view directly
    :ref:`from the App <app-evaluation-patches>`!

.. image:: /images/evaluation/evaluation_patches.gif
    :alt: evaluation-patches
    :align: center

|br|
Evaluation patches views are just like any other
:ref:`dataset view <using-views>` in the sense that:

-   You can append view stages via the :ref:`App view bar <app-create-view>` or
    :ref:`views API <using-views>`
-   Any modifications to ground truth or predicted label tags that you make via
    the App's :ref:`tagging menu <app-tagging>` or via API methods like
    :meth:`tag_labels() <fiftyone.core.collections.SampleCollection.tag_labels>`
    and :meth:`untag_labels() <fiftyone.core.collections.SampleCollection.untag_labels>`
    will be reflected on the source dataset
-   Any modifications to the predicted or ground truth |Label| elements in the
    patches view that you make by iterating over the contents of the view or
    calling
    :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
    will be reflected on the source dataset
-   Calling :meth:`save() <fiftyone.core.patches.EvaluationPatchesView.save>`
    on an evaluation patches view (typically one that contains additional view
    stages that filter or modify its contents) will sync any |Label| edits or
    deletions with the source dataset

However, because evaluation patches views only contain a subset of the contents
of a |Sample| from the source dataset, there are some differences in behavior
compared to non-patch views:

-   Tagging or untagging patches themselves (as opposed to their labels) will
    not affect the tags of the underlying |Sample|
-   Any new fields that you add to an evaluation patches view will not be added
    to the source dataset

.. _evaluating-detections-coco:

COCO-style evaluation (default spatial)
---------------------------------------

By default,
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
will use `COCO-style evaluation <https://cocodataset.org/#detection-eval>`_ to
analyze predictions when the specified label fields are |Detections| or
|Polylines|.

You can also explicitly request that COCO-style evaluation be used by setting
the ``method`` parameter to ``"coco"``.

.. note::

    FiftyOne's implementation of COCO-style evaluation matches the reference
    implementation available via
    `pycocotools <https://github.com/cocodataset/cocoapi>`_.

Overview
~~~~~~~~

When running COCO-style evaluation using
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

-   Predicted and ground truth objects are matched using a specified IoU
    threshold (default = 0.50). This threshold can be customized via the
    ``iou`` parameter

-   By default, only objects with the same ``label`` will be matched. Classwise
    matching can be disabled via the ``classwise`` parameter

-   Ground truth objects can have an ``iscrowd`` attribute that indicates
    whether the annotation contains a crowd of objects. Multiple predictions
    can be matched to crowd ground truth objects. The name of this attribute
    can be customized by passing the optional ``iscrowd`` attribute of
    |COCOEvaluationConfig| to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`

When you specify an ``eval_key`` parameter, a number of helpful fields will be
populated on each sample and its predicted/ground truth objects:

-   True positive (TP), false positive (FP), and false negative (FN) counts
    for each sample are saved in top-level fields of each sample::

        TP: sample.<eval_key>_tp
        FP: sample.<eval_key>_fp
        FN: sample.<eval_key>_fn

-   The fields listed below are populated on each individual object instance;
    these fields tabulate the TP/FP/FN status of the object, the ID of the
    matching object (if any), and the matching IoU::

        TP/FP/FN: object.<eval_key>
              ID: object.<eval_key>_id
             IoU: object.<eval_key>_iou

.. note::

    See |COCOEvaluationConfig| for complete descriptions of the optional
    keyword arguments that you can pass to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
    when running COCO-style evaluation.

Example evaluation
~~~~~~~~~~~~~~~~~~

The example below demonstrates COCO-style detection evaluation on the
:ref:`quickstart dataset <dataset-zoo-quickstart>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")
    print(dataset)

    # Evaluate the objects in the `predictions` field with respect to the
    # objects in the `ground_truth` field
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
    )

    # Get the 10 most common classes in the dataset
    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    results.print_report(classes=classes)

    # Print some statistics about the total TP/FP/FN counts
    print("TP: %d" % dataset.sum("eval_tp"))
    print("FP: %d" % dataset.sum("eval_fp"))
    print("FN: %d" % dataset.sum("eval_fn"))

    # Create a view that has samples with the most false positives first, and
    # only includes false positive boxes in the `predictions` field
    view = (
        dataset
        .sort_by("eval_fp", reverse=True)
        .filter_labels("predictions", F("eval") == "fp")
    )

    # Visualize results in the App
    session = fo.launch_app(view=view)

.. code-block:: text

                   precision    recall  f1-score   support

           person       0.45      0.74      0.56       783
             kite       0.55      0.72      0.62       156
              car       0.12      0.54      0.20        61
             bird       0.63      0.67      0.65       126
           carrot       0.06      0.49      0.11        47
             boat       0.05      0.24      0.08        37
        surfboard       0.10      0.43      0.17        30
         airplane       0.29      0.67      0.40        24
    traffic light       0.22      0.54      0.31        24
            bench       0.10      0.30      0.15        23

        micro avg       0.32      0.68      0.43      1311
        macro avg       0.26      0.54      0.32      1311
     weighted avg       0.42      0.68      0.50      1311

.. image:: /images/evaluation/quickstart_evaluate_detections.png
   :alt: quickstart-evaluate-detections
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

mAP, mAR and PR curves
~~~~~~~~~~~~~~~~~~~~~~

You can compute mean average precision (mAP), mean average recall (mAR), and
precision-recall (PR) curves for your predictions by passing the
``compute_mAP=True`` flag to
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

.. note::

    All mAP and mAR calculations are performed according to the
    `COCO evaluation protocol <https://cocodataset.org/#detection-eval>`_.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    print(dataset)

    # Performs an IoU sweep so that mAP, mAR, and PR curves can be computed
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        compute_mAP=True,
    )

    print(results.mAP())
    # 0.3957

    print(results.mAR())
    # 0.5210

    plot = results.plot_pr_curves(classes=["person", "kite", "car"])
    plot.show()

.. image:: /images/evaluation/coco_pr_curves.png
   :alt: coco-pr-curves
   :align: center

Confusion matrices
~~~~~~~~~~~~~~~~~~

You can also easily generate :ref:`confusion matrices <confusion-matrices>` for
the results of COCO-style evaluations.

In order for the confusion matrix to capture anything other than false
positive/negative counts, you will likely want to set the
:class:`classwise <fiftyone.utils.eval.coco.COCOEvaluationConfig>` parameter
to ``False`` during evaluation so that predicted objects can be matched with
ground truth objects of different classes.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Perform evaluation, allowing objects to be matched between classes
    results = dataset.evaluate_detections(
        "predictions", gt_field="ground_truth", classwise=False
    )

    # Generate a confusion matrix for the specified classes
    plot = results.plot_confusion_matrix(classes=["car", "truck", "motorcycle"])
    plot.show()

.. image:: /images/evaluation/coco_confusion_matrix.png
   :alt: coco-confusion-matrix
   :align: center

.. _evaluating-detections-open-images:

Open Images-style evaluation
----------------------------

.. customavailablein::
    :oss_version: 0.9.0
    :enterprise_version: 1.0

The :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
method also supports
`Open Images-style evaluation <https://storage.googleapis.com/openimages/web/evaluation.html>`_.

In order to run Open Images-style evaluation, simply set the ``method``
parameter to ``"open-images"``.

.. note::

    FiftyOne's implementation of Open Images-style evaluation matches the
    reference implementation available via the
    `TF Object Detection API <https://github.com/tensorflow/models/tree/master/research/object_detection>`_.

Overview
~~~~~~~~

Open Images-style evaluation provides additional features not found in
:ref:`COCO-style evaluation <evaluating-detections-coco>` that you may find
useful when evaluating your custom datasets.

The two primary differences are:

-   **Non-exhaustive image labeling:** positive and negative sample-level
    |Classifications| fields can be provided to indicate which object classes
    were considered when annotating the image. Predicted objects whose classes
    are not included in the sample-level labels for a sample are ignored.
    The names of these fields can be specified via the ``pos_label_field`` and
    ``neg_label_field`` parameters

-   **Class hierarchies:** If your dataset includes a
    `class hierarchy <https://storage.googleapis.com/openimages/2018_04/bbox_labels_600_hierarchy_visualizer/circle.html>`_,
    you can configure this evaluation protocol to automatically expand ground
    truth and/or predicted leaf classes so that all levels of the hierarchy can
    be `correctly evaluated <https://storage.googleapis.com/openimages/web/evaluation.html>`_.
    You can provide a label hierarchy via the ``hierarchy`` parameter. By
    default, if you provide a hierarchy, then image-level label fields and
    ground truth detections will be expanded to incorporate parent classes
    (child classes for negative image-level labels). You can disable this
    feature by setting the ``expand_gt_hierarchy`` parameter to ``False``.
    Alternatively, you can expand predictions by setting the
    ``expand_pred_hierarchy`` parameter to ``True``

In addition, note that:

-   Like `VOC-style evaluation <http://host.robots.ox.ac.uk/pascal/VOC/voc2010/devkit_doc_08-May-2010.pdf>`_,
    only one IoU (default = 0.5) is used to calculate mAP. You can customize
    this value via the ``iou`` parameter

-   When dealing with crowd objects, Open Images-style evaluation dictates that
    if a crowd is matched with multiple predictions, each counts as one true
    positive when computing mAP

When you specify an ``eval_key`` parameter, a number of helpful fields will be
populated on each sample and its predicted/ground truth objects:

-   True positive (TP), false positive (FP), and false negative (FN) counts
    for each sample are saved in top-level fields of each sample::

        TP: sample.<eval_key>_tp
        FP: sample.<eval_key>_fp
        FN: sample.<eval_key>_fn

-   The fields listed below are populated on each individual |Detection|
    instance; these fields tabulate the TP/FP/FN status of the object, the ID
    of the matching object (if any), and the matching IoU::

        TP/FP/FN: object.<eval_key>
              ID: object.<eval_key>_id
             IoU: object.<eval_key>_iou

.. note::

    See |OpenImagesEvaluationConfig| for complete descriptions of the optional
    keyword arguments that you can pass to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
    when running Open Images-style evaluation.

Example evaluation
~~~~~~~~~~~~~~~~~~

The example below demonstrates Open Images-style detection evaluation on the
:ref:`quickstart dataset <dataset-zoo-quickstart>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")
    print(dataset)

    # Evaluate the objects in the `predictions` field with respect to the
    # objects in the `ground_truth` field
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        method="open-images",
        eval_key="eval",
    )

    # Get the 10 most common classes in the dataset
    counts = dataset.count_values("ground_truth.detections.label")
    classes = sorted(counts, key=counts.get, reverse=True)[:10]

    # Print a classification report for the top-10 classes
    results.print_report(classes=classes)

    # Print some statistics about the total TP/FP/FN counts
    print("TP: %d" % dataset.sum("eval_tp"))
    print("FP: %d" % dataset.sum("eval_fp"))
    print("FN: %d" % dataset.sum("eval_fn"))

    # Create a view that has samples with the most false positives first, and
    # only includes false positive boxes in the `predictions` field
    view = (
        dataset
        .sort_by("eval_fp", reverse=True)
        .filter_labels("predictions", F("eval") == "fp")
    )

    # Visualize results in the App
    session = fo.launch_app(view=view)

.. code-block:: text

                   precision    recall  f1-score   support

           person       0.25      0.86      0.39       378
             kite       0.27      0.75      0.40        75
              car       0.18      0.80      0.29        61
             bird       0.20      0.51      0.28        51
           carrot       0.09      0.74      0.16        47
             boat       0.09      0.46      0.16        37
        surfboard       0.17      0.73      0.28        30
         airplane       0.36      0.83      0.50        24
    traffic light       0.32      0.79      0.45        24
          giraffe       0.36      0.91      0.52        23

        micro avg       0.21      0.79      0.34       750
        macro avg       0.23      0.74      0.34       750
     weighted avg       0.23      0.79      0.36       750

.. image:: /images/evaluation/quickstart_evaluate_detections_oi.png
   :alt: quickstart-evaluate-detections-oi
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

mAP and PR curves
~~~~~~~~~~~~~~~~~

You can easily compute mean average precision (mAP) and precision-recall (PR)
curves using the results object returned by
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

.. note::

    FiftyOne's implementation of Open Images-style evaluation matches the
    reference implementation available via the
    `TF Object Detection API <https://github.com/tensorflow/models/tree/master/research/object_detection>`_.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    print(dataset)

    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        method="open-images",
    )

    print(results.mAP())
    # 0.599

    plot = results.plot_pr_curves(classes=["person", "dog", "car"])
    plot.show()

.. image:: /images/evaluation/oi_pr_curve.png
   :alt: oi-pr-curve
   :align: center

Confusion matrices
~~~~~~~~~~~~~~~~~~

You can also easily generate :ref:`confusion matrices <confusion-matrices>` for
the results of Open Images-style evaluations.

In order for the confusion matrix to capture anything other than false
positive/negative counts, you will likely want to set the
:class:`classwise <fiftyone.utils.eval.openimages.OpenImagesEvaluationConfig>`
parameter to ``False`` during evaluation so that predicted objects can be
matched with ground truth objects of different classes.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Perform evaluation, allowing objects to be matched between classes
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        method="open-images",
        classwise=False,
    )

    # Generate a confusion matrix for the specified classes
    plot = results.plot_confusion_matrix(classes=["car", "truck", "motorcycle"])
    plot.show()

.. image:: /images/evaluation/oi_confusion_matrix.png
   :alt: oi-confusion-matrix
   :align: center

.. _evaluating-detections-activitynet:

ActivityNet-style evaluation (default temporal)
-----------------------------------------------

By default,
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
will use 
`ActivityNet-style temporal detection evaluation <https://github.com/activitynet/ActivityNet/tree/master/Evaluation>`_.
to analyze predictions when the specified label fields are |TemporalDetections|.

You can also explicitly request that ActivityNet-style evaluation be used by setting
the ``method`` parameter to ``"activitynet"``.

.. note::

    FiftyOne's implementation of ActivityNet-style evaluation matches the
    reference implementation available via the
    `ActivityNet API <https://github.com/activitynet/ActivityNet/tree/master/Evaluation>`_.

Overview
~~~~~~~~

When running ActivityNet-style evaluation using
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

-   Predicted and ground truth segments are matched using a specified IoU
    threshold (default = 0.50). This threshold can be customized via the
    ``iou`` parameter

-   By default, only segments with the same ``label`` will be matched.
    Classwise matching can be disabled by passing ``classwise=False``

-   mAP is computed by averaging over the same range of IoU values
    :ref:`used by COCO <coco-map>`

When you specify an ``eval_key`` parameter, a number of helpful fields will be
populated on each sample and its predicted/ground truth segments:

-   True positive (TP), false positive (FP), and false negative (FN) counts
    for each sample are saved in top-level fields of each sample::

        TP: sample.<eval_key>_tp
        FP: sample.<eval_key>_fp
        FN: sample.<eval_key>_fn

-   The fields listed below are populated on each individual temporal detection
    segment; these fields tabulate the TP/FP/FN status of the segment, the ID
    of the matching segment (if any), and the matching IoU::

        TP/FP/FN: segment.<eval_key>
              ID: segment.<eval_key>_id
             IoU: segment.<eval_key>_iou

.. note::

    See |ActivityNetEvaluationConfig| for complete descriptions of the optional
    keyword arguments that you can pass to
    :meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`
    when running ActivityNet-style evaluation.

Example evaluation
~~~~~~~~~~~~~~~~~~

The example below demonstrates ActivityNet-style temporal detection evaluation
on the :ref:`ActivityNet 200 dataset <dataset-zoo-activitynet-200>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    import random

    # Load subset of ActivityNet 200
    classes = ["Bathing dog", "Walking the dog"]
    dataset = foz.load_zoo_dataset(
        "activitynet-200",
        split="validation",
        classes=classes,
        max_samples=10,
    )
    print(dataset)

    # Generate some fake predictions for this example
    random.seed(51)
    dataset.clone_sample_field("ground_truth", "predictions")
    for sample in dataset:
        for det in sample.predictions.detections:
            det.support[0] += random.randint(-10,10)
            det.support[1] += random.randint(-10,10)
            det.support[0] = max(det.support[0], 1)
            det.support[1] = max(det.support[1], det.support[0] + 1)
            det.confidence = random.random()
            det.label = random.choice(classes)

        sample.save()

    # Evaluate the segments in the `predictions` field with respect to the
    # segments in the `ground_truth` field
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
    )

    # Print a classification report for the classes
    results.print_report(classes=classes)

    # Print some statistics about the total TP/FP/FN counts
    print("TP: %d" % dataset.sum("eval_tp"))
    print("FP: %d" % dataset.sum("eval_fp"))
    print("FN: %d" % dataset.sum("eval_fn"))

    # Create a view that has samples with the most false positives first, and
    # only includes false positive segments in the `predictions` field
    view = (
        dataset
        .sort_by("eval_fp", reverse=True)
        .filter_labels("predictions", F("eval") == "fp")
    )

    # Visualize results in the App
    session = fo.launch_app(view=view)

.. code-block:: text

                   precision    recall  f1-score   support

      Bathing dog       0.50      0.40      0.44         5
  Walking the dog       0.50      0.60      0.55         5
  
        micro avg       0.50      0.50      0.50        10
        macro avg       0.50      0.50      0.49        10
     weighted avg       0.50      0.50      0.49        10

.. image:: /images/evaluation/activitynet_evaluate_detections.png
   :alt: activitynet-evaluate-detections
   :align: center

.. note::

    The easiest way to analyze models in FiftyOne is via the
    :ref:`Model Evaluation panel <app-model-evaluation-panel>`!

mAP and PR curves
~~~~~~~~~~~~~~~~~

You can compute mean average precision (mAP) and precision-recall (PR) curves
for your segments by passing the ``compute_mAP=True`` flag to
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`:

.. note::

    All mAP calculations are performed according to the
    `ActivityNet evaluation protocol <https://github.com/activitynet/ActivityNet/tree/master/Evaluation>`_.

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load subset of ActivityNet 200
    classes = ["Bathing dog", "Walking the dog"]
    dataset = foz.load_zoo_dataset(
        "activitynet-200",
        split="validation",
        classes=classes,
        max_samples=10,
    )
    print(dataset)

    # Generate some fake predictions for this example
    random.seed(51)
    dataset.clone_sample_field("ground_truth", "predictions")
    for sample in dataset:
        for det in sample.predictions.detections:
            det.support[0] += random.randint(-10,10)
            det.support[1] += random.randint(-10,10)
            det.support[0] = max(det.support[0], 1)
            det.support[1] = max(det.support[1], det.support[0] + 1)
            det.confidence = random.random()
            det.label = random.choice(classes)

        sample.save()

    # Performs an IoU sweep so that mAP and PR curves can be computed
    results = dataset.evaluate_detections(
        "predictions",
        gt_field="ground_truth",
        eval_key="eval",
        compute_mAP=True,
    )

    print(results.mAP())
    # 0.367

    plot = results.plot_pr_curves(classes=classes)
    plot.show()

.. image:: /images/evaluation/activitynet_pr_curves.png
   :alt: activitynet-pr-curves
   :align: center

Confusion matrices
~~~~~~~~~~~~~~~~~~

You can also easily generate :ref:`confusion matrices <confusion-matrices>` for
the results of ActivityNet-style evaluations.

In order for the confusion matrix to capture anything other than false
positive/negative counts, you will likely want to set the
:class:`classwise <fiftyone.utils.eval.coco.ActivityNetEvaluationConfig>`
parameter to ``False`` during evaluation so that predicted segments can be
matched with ground truth segments of different classes.

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load subset of ActivityNet 200
    classes = ["Bathing dog", "Grooming dog", "Grooming horse", "Walking the dog"]
    dataset = foz.load_zoo_dataset(
        "activitynet-200",
        split="validation",
        classes=classes,
        max_samples=20,
    )
    print(dataset)

    # Generate some fake predictions for this example
    random.seed(51)
    dataset.clone_sample_field("ground_truth", "predictions")
    for sample in dataset:
        for det in sample.predictions.detections:
            det.support[0] += random.randint(-10,10)
            det.support[1] += random.randint(-10,10)
            det.support[0] = max(det.support[0], 1)
            det.support[1] = max(det.support[1], det.support[0] + 1)
            det.confidence = random.random()
            det.label = random.choice(classes)

        sample.save()

    # Perform evaluation, allowing objects to be matched between classes
    results = dataset.evaluate_detections(
        "predictions", gt_field="ground_truth", classwise=False
    )

    # Generate a confusion matrix for the specified classes
    plot = results.plot_confusion_matrix(classes=classes)
    plot.show()

.. image:: /images/evaluation/activitynet_confusion_matrix.png
   :alt: activitynet-confusion-matrix
   :align: center

