.. _filtering-cheat-sheet:

Filtering Cheat Sheet
=====================

.. default-role:: code

This cheat sheet shows how to perform common matching and filtering operations
in FiftyOne using :ref:`dataset views <using-views>`.

Strings and pattern matching
____________________________

The formulas in this section use the following example data:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart")

+-----------------------------------------+-----------------------------------------------------------------------+
| Operation                               | Command                                                               |
+=========================================+=======================================================================+
| Filepath starts with "/Users"           |  .. code-block::                                                      |
|                                         |                                                                       |
|                                         |     ds.match(F("filepath").starts_with("/Users"))                     |
+-----------------------------------------+-----------------------------------------------------------------------+
| Filepath ends with "10.jpg" or "10.png" |  .. code-block::                                                      |
|                                         |                                                                       |
|                                         |     ds.match(F("filepath").ends_with(("10.jpg", "10.png"))            |
+-----------------------------------------+-----------------------------------------------------------------------+
| Label contains string "be"              |  .. code-block::                                                      |
|                                         |                                                                       |
|                                         |     ds.filter_labels(                                                 |
|                                         |         "predictions",                                                |
|                                         |         F("label").contains_str("be"),                                |
|                                         |     )                                                                 |
+-----------------------------------------+-----------------------------------------------------------------------+
| Filepath contains "088" and is JPEG     |  .. code-block::                                                      |
|                                         |                                                                       |
|                                         |     ds.match(F("filepath").re_match("088*.jpg"))                      |
+-----------------------------------------+-----------------------------------------------------------------------+

Reference:
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` and
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`.

Dates and times
_______________

The formulas in this section use the following example data:

.. code-block:: python
    :linenos:

    from datetime import datetime, timedelta

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    filepaths = ["image%d.jpg" % i for i in range(5)]
    dates = [
        datetime(2021, 8, 24, 1, 0, 0),
        datetime(2021, 8, 24, 2, 0, 0),
        datetime(2021, 8, 25, 3, 11, 12),
        datetime(2021, 9, 25, 4, 22, 23),
        datetime(2022, 9, 27, 5, 0, 0)
    ]

    ds = fo.Dataset()
    ds.add_samples(
        [fo.Sample(filepath=f, date=d) for f, d in zip(filepaths, dates)]
    )

    # Example data
    query_date = datetime(2021, 8, 24, 2, 0, 1)
    query_delta = timedelta(minutes=30)

+-------------------------------------------+-----------------------------------------------------------------------+
| Operation                                 | Command                                                               |
+===========================================+=======================================================================+
| After 2021-08-24 02:01:00                 |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date") > query_date)                                  |
+-------------------------------------------+-----------------------------------------------------------------------+
| Within 30 minutes of 2021-08-24 02:01:00  |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(abs(F("date") - query_date) < query_delta)               |
+-------------------------------------------+-----------------------------------------------------------------------+
| On the 24th of the month                  |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").day_of_month() == 24)                          |
+-------------------------------------------+-----------------------------------------------------------------------+
| On even day of the week                   |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").day_of_week() % 2 == 0)                        |
+-------------------------------------------+-----------------------------------------------------------------------+
| On the 268th day of the year              |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").day_of_year() == 268)                          |
+-------------------------------------------+-----------------------------------------------------------------------+
| In the 9th month of the year (September)  |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").month() == 9)                                  |
+-------------------------------------------+-----------------------------------------------------------------------+
| In the 38th week of the year              |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").week() == 38)                                  |
+-------------------------------------------+-----------------------------------------------------------------------+
| In the year 2022                          |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").year() == 2022)                                |
+-------------------------------------------+-----------------------------------------------------------------------+
| With minute not equal to 0                |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.match(F("date").minute() != 0)                                 |
+-------------------------------------------+-----------------------------------------------------------------------+

Reference:
:meth:`match() <fiftyone.core.collections.SampleCollection.match>`.

Geospatial
__________

The formulas in this section use the following example data:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    TIMES_SQUARE = [-73.9855, 40.7580]
    MANHATTAN = [
        [
            [-73.949701, 40.834487],
            [-73.896611, 40.815076],
            [-73.998083, 40.696534],
            [-74.031751, 40.715273],
            [-73.949701, 40.834487],
        ]
    ]

    ds = foz.load_zoo_dataset("quickstart-geo")

+-------------------------------------------+-----------------------------------------------------------------------+
| Operation                                 | Command                                                               |
+===========================================+=======================================================================+
| Within 5km of Times Square                |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.geo_near(TIMES_SQUARE, max_distance=5000)                      |
+-------------------------------------------+-----------------------------------------------------------------------+
| Within Manhattan                          |  .. code-block::                                                      |
|                                           |                                                                       |
|                                           |     ds.geo_within(MANHATTAN)                                          |
+-------------------------------------------+-----------------------------------------------------------------------+

Reference:
:meth:`geo_near() <fiftyone.core.collections.SampleCollection.geo_near>` and
:meth:`geo_within() <fiftyone.core.collections.SampleCollection.geo_within>`.

Detections
__________

The formulas in this section use the following example data:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart")

+--------------------------------------+-------------------------------------------------------------------------+
| Operation                            | Command                                                                 |
+======================================+=========================================================================+
| Predictions with confidence > 0.95   |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.filter_labels("predictions", F("confidence") > 0.95)             |
+--------------------------------------+-------------------------------------------------------------------------+
| Exactly 10 ground truth detections   |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.match(F("ground_truth.detections").length() == 10)               |
+--------------------------------------+-------------------------------------------------------------------------+
| At least one dog                     |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.match(                                                           |
|                                      |         F("ground_truth.detections.label").contains("dog")              |
|                                      |     )                                                                   |
+--------------------------------------+-------------------------------------------------------------------------+
| Images that do not contain dogs      |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.match(                                                           |
|                                      |         ~F("ground_truth.detections.label").contains("dog")             |
|                                      |     )                                                                   |
+--------------------------------------+-------------------------------------------------------------------------+
| Only dog detections                  |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.filter_labels("ground_truth", F("label") == "dog")               |
+--------------------------------------+-------------------------------------------------------------------------+
| Images that only contain dogs        |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.match(                                                           |
|                                      |         F("ground_truth.detections.label").is_subset(                   |
|                                      |             ["dog"]                                                     |
|                                      |         )                                                               |
|                                      |     )                                                                   |
+--------------------------------------+-------------------------------------------------------------------------+
| Contains either a cat or a dog       |  .. code-block::                                                        |
|                                      |                                                                         |
|                                      |     ds.match(                                                           |
|                                      |          F("predictions.detections.label").contains(                    |
|                                      |             ["cat","dog"]                                               |
|                                      |          )                                                              |
|                                      |     )                                                                   |
+--------------------------------------+-------------------------------------------------------------------------+
| Contains a cat and a dog prediction  | .. code-block:: python                                                  |
|                                      |                                                                         |
|                                      |    ds.match(                                                            |
|                                      |        F("predictions.detections.label").contains(                      |
|                                      |            ["cat", "dog"], all=True                                     |
|                                      |        )                                                                |
|                                      |    )                                                                    |
+--------------------------------------+-------------------------------------------------------------------------+
| Contains a cat or dog but not both   | .. code-block:: python                                                  |
|                                      |                                                                         |
|                                      |    field = "predictions.detections.label"                               |
|                                      |    one_expr = F(field).contains(["cat", "dog"])                         |
|                                      |    both_expr = F(field).contains(["cat", "dog"], all=True)              |
|                                      |    ds.match(one_expr & ~both_expr)                                      |
+--------------------------------------+-------------------------------------------------------------------------+

Reference:
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` and
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`.

Bounding boxes
--------------

The formulas in this section assume the following code has been run:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart")

    box_width, box_height = F("bounding_box")[2], F("bounding_box")[3]
    rel_area = box_width * box_height

    im_width, im_height = F("$metadata.width"), F("$metadata.height")
    abs_area = rel_bbox_area * im_width * im_height

+---------------------------------+-------------------------------------------------------------------------+
| Bounding box query              | Command                                                                 |
+=================================+=========================================================================+
| Larger than absolute size       | .. code-block:: python                                                  |
|                                 |                                                                         |
|                                 |    ds.filter_labels("predictions", abs_area > 96**2)                    |
+---------------------------------+-------------------------------------------------------------------------+
| Between two relative sizes      | .. code-block:: python                                                  |
|                                 |                                                                         |
|                                 |    good_bboxes = (rel_area > 0.25) & (rel_area < 0.75)                  |
|                                 |    good_expr = bbox_area.let_in(good_bboxes)                            |
|                                 |    ds.filter_labels("predictions", good_expr)                           |
+---------------------------------+-------------------------------------------------------------------------+
| Approximately square            | .. code-block:: python                                                  |
|                                 |                                                                         |
|                                 |    rectangleness = abs(                                                 |
|                                 |        box_width * im_width - box_height * im_height                    |
|                                 |    )                                                                    |
|                                 |    ds.select_fields("predictions").filter_labels(                       |
|                                 |        "predictions", rectangleness <= 1                                |
|                                 |    )                                                                    |
+---------------------------------+-------------------------------------------------------------------------+
| Aspect ratio > 2                | .. code-block:: python                                                  |
|                                 |                                                                         |
|                                 |    aspect_ratio = (                                                     |
|                                 |        (box_width * im_width) / (box_height * im_height)                |
|                                 |    )                                                                    |
|                                 |    ds.select_fields("predictions").filter_labels(                       |
|                                 |        "predictions", aspect_ratio > 2                                  |
|                                 |    )                                                                    |
+---------------------------------+-------------------------------------------------------------------------+

Reference:
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
and
:meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`.

Evaluating detections
---------------------

The formulas in this section assume the following code has been run on a
dataset ``ds`` with detections in its ``predictions`` field:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart")

    ds.evaluate_detections("predictions", eval_key="eval")

    fob.compute_uniqueness(ds)
    fob.compute_mistakenness(ds, "predictions", label_field="ground_truth")
    ep = ds.to_evaluation_patches("eval")

+-------------------------------------------+-------------------------------------------------------------------------+
| Operation                                 | Command                                                                 |
+===========================================+=========================================================================+
| Uniqueness > 0.9                          |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.match(F("uniqueness") > 0.9)                                     |
+-------------------------------------------+-------------------------------------------------------------------------+
| 10 most unique images                     |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.sort_by("uniqueness", reverse=True)[:10]                         |
+-------------------------------------------+-------------------------------------------------------------------------+
| Predictions with confidence > 0.95        |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     filter_labels("predictions", F("confidence") > 0.95)                |
+-------------------------------------------+-------------------------------------------------------------------------+
| 10 most "wrong" predictions               |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.sort_by("mistakenness", reverse=True)[:10]                       |
+-------------------------------------------+-------------------------------------------------------------------------+
| Images with more than 10 false positives  |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.match(F("eval_fp") > 10)                                         |
+-------------------------------------------+-------------------------------------------------------------------------+
| False positive "dog" detections           |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ep.match_labels(                                                    |
|                                           |        filter=(F("eval") == "fp") & (F("label") == "dog"),              |
|                                           |        fields="predictions",                                            |
|                                           |     )                                                                   |
+-------------------------------------------+-------------------------------------------------------------------------+
| Predictions with IoU > 0.9                |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ep.match(F("iou") > 0.9)                                            |
+-------------------------------------------+-------------------------------------------------------------------------+

Reference:
:meth:`match() <fiftyone.core.collections.SampleCollection.match>`,
:meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`,
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`,
and
:meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`.

Classifications
_______________

Evaluating classifications
--------------------------

The formulas in the following table assumes the following code has been run on
a dataset ``ds``, where the ``predictions`` field is populated with
classification predictions that have their ``logits`` attribute set:

.. code-block:: python
    :linenos:

    import fiftyone.brain as fob
    import fiftyone.zoo as foz

    ds = foz.load_zoo_dataset("cifar10", split="test")

    # TODO: add your own predicted classifications

    ds.evaluate_classifications("predictions", gt_field="ground_truth")

    fob.compute_uniqueness(ds)
    fob.compute_hardness(ds, "predictions")
    fob.compute_mistakenness(ds, "predictions", label_field="ground_truth")

+-------------------------------------------+-------------------------------------------------------------------------+
| Operation                                 | Command                                                                 |
+===========================================+=========================================================================+
| 10 most unique incorrect predictions      |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.match(                                                           |
|                                           |         F("predictions.label") != F("ground_truth.label")               |
|                                           |     ).sort_by("uniqueness", reverse=True)[:10]                          |
+-------------------------------------------+-------------------------------------------------------------------------+
| 10 most "wrong" predictions               |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.sort_by("mistakenness", reverse=True)[:10]                       |
+-------------------------------------------+-------------------------------------------------------------------------+
| 10 most likely annotation mistakes        |  .. code-block:: python                                                 |
|                                           |                                                                         |
|                                           |     ds.match_tags("train").sort_by(                                     |
|                                           |         "mistakenness, reverse=True                                     |
|                                           |     )[:10]                                                              |
+-------------------------------------------+-------------------------------------------------------------------------+

Reference:
:meth:`match() <fiftyone.core.collections.SampleCollection.match>`,
:meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`,
and
:meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`.

Built-in filter and match functions
___________________________________

FiftyOne has special methods for matching and filtering on specific data types. 
Take a look at the examples in this section to see how various operations can
be performed via these special purpose methods, and compare that to the brute
force implementation of the same operation that follows.

The tables in this section use the following example data:

.. code-block:: python
    :linenos:

    from bson import ObjectId

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart")

    # Tag a few random samples
    ds.take(3).tag_labels("potential_mistake", label_fields="predictions")

    # Grab a few label IDs
    label_ids = [
        dataset.first().ground_truth.detections[0].id,
        dataset.last().predictions.detections[0].id,
    ]
    ds.select_labels(ids=label_ids).tag_labels("error")

    len_filter = F("label").strlen() < 3
    id_filter = F("_id").is_in([ObjectId(_id) for _id in label_ids])

Filtering labels
----------------

+---------------+-------------------------------------------------------------------------+
| Operation     | Get predicted detections that have confidence > 0.9                     |
+===============+=========================================================================+
| Idiomatic     |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.filter_labels("predictions", F("confidence") > 0.9)              |
+---------------+-------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.set_field(                                                       |
|               |         "predictions.detections",                                       |
|               |         F("detections").filter(F("confidence") > 0.9)),                 |
|               |     )                                                                   |
+---------------+-------------------------------------------------------------------------+

Reference:
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`.

Matching labels
---------------

+---------------+-----------------------------------------------------------------------------------------------------+
| Operation     | Samples that have labels with id's in the list ``label_ids``                                        |
+===============+=====================================================================================================+
| Idiomatic     |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     ds.match_labels(ids=label_ids)                                                                  |
+---------------+-----------------------------------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |    pred_expr = F("predictions.detections").filter(id_filter).length() > 0                           |
|               |    gt_expr = F("ground_truth.detections").filter(id_filter).length() > 0                            |
|               |    ds.match(pred_expr | gt_expr)                                                                    |
+---------------+-----------------------------------------------------------------------------------------------------+

+---------------+-----------------------------------------------------------------------------------------------------+
| Operation     | Samples that have labels satisfying ``len_filter`` in ``predictions`` or ``ground_truth`` field     |
+===============+=====================================================================================================+
| Idiomatic     |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     ds.match_labels(                                                                                |
|               |         filter=len_filter,                                                                          |
|               |         fields=["predictions", "ground_truth"],                                                     |
|               |     )                                                                                               |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     pred_expr = F("predictions.detections").filter(len_filter).length() > 0                         |
|               |     gt_expr = F("ground_truth.detections").filter(len_filter).length() > 0                          |
|               |     ds.match(pred_expr | gt_expr)                                                                   |
+---------------+-----------------------------------------------------------------------------------------------------+

+---------------+-----------------------------------------------------------------------------------------------------+
| Operation     | Samples that have labels with tag "error" in ``predictions`` or ``ground_truth`` field              |
+===============+=====================================================================================================+
| Idiomatic     |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     ds.match_labels(tags="error")                                                                   |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     tag_expr = F("tags").contains("error")                                                          |
|               |     pred_expr = F("predictions.detections").filter(tag_expr).length() > 0                           |
|               |     gt_expr = F("ground_truth.detections").filter(tag_expr).length() > 0                            |
|               |     ds.match(pred_expr | gt_expr)                                                                   |
+---------------+-----------------------------------------------------------------------------------------------------+

Reference:
:meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`.

Matching tags
-------------

+---------------+-------------------------------------------------------------------------+
| Operation     | Samples that have tag ``validation``                                    |
+===============+=========================================================================+
| Idiomatic     |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.match_tags("validation")                                         |
+---------------+-------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.match(F("tags").contains("validation"))                          |
+---------------+-------------------------------------------------------------------------+

Reference:
:meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`.

Matching frames
---------------

The following table uses this example data:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    ds = foz.load_zoo_dataset("quickstart-video")
    num_objects = F("detections.detections").length()

+---------------+-------------------------------------------------------------------------+
| Operation     | Frames with at least 10 detections                                      |
+===============+=========================================================================+
| Idiomatic     |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.match_frames(num_objects > 10)                                   |
+---------------+-------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                 |
|               |                                                                         |
|               |     ds.match(F("frames").filter(num_objects > 10).length() > 0)         |
+---------------+-------------------------------------------------------------------------+

Reference:
:meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`.

Filtering keypoints
-------------------

You can use
:meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`
to retrieve individual keypoints within a |Keypoint| instance that match a
specified condition.

The following table uses this example data:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    from fiftyone import ViewField as F

    ds = fo.Dataset()
    ds.add_samples(
        [
            fo.Sample(
                filepath="image1.jpg",
                predictions=fo.Keypoints(
                    keypoints=[
                        fo.Keypoint(
                            label="person",
                            points=[(0.1, 0.1), (0.1, 0.9), (0.9, 0.9), (0.9, 0.1)],
                            confidence=[0.7, 0.8, 0.95, 0.99],
                        )
                    ]
                )
            ),
            fo.Sample(filepath="image2.jpg"),
        ]
    )

    ds.default_skeleton = fo.KeypointSkeleton(
        labels=["nose", "left eye", "right eye", "left ear", "right ear"],
        edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
    )

+---------------+-----------------------------------------------------------------------------------------------------+
| Operation     | Only include predicted keypoints with confidence > 0.9                                              |
+===============+=====================================================================================================+
| Idiomatic     |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     ds.filter_keypoints("predictions", filter=F("confidence") > 0.9)                                |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |  .. code-block:: python                                                                             |
|               |                                                                                                     |
|               |     tmp = ds.clone()                                                                                |
|               |     for sample in tmp.iter_samples(autosave=True):                                                  |
|               |         if sample.predictions is None:                                                              |
|               |             continue                                                                                |
|               |                                                                                                     |
|               |         for keypoint in sample.predictions.keypoints:                                               |
|               |             for i, confidence in enumerate(keypoint.confidence):                                    |
|               |                 if confidence <= 0.9:                                                               |
|               |                     keypoint.points[i] = [None, None]                                               |
+---------------+-----------------------------------------------------------------------------------------------------+

Reference:
:meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`.
