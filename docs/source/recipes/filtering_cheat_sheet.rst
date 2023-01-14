.. _filtering-cheat-sheet:

Filtering
==================

.. default-role:: code

A cheat sheet showing how to perform matching and filtering operations in FiftyOne! Where it is possible to perform these operations via the FiftyOne App, instructions for doing so can be revealed by expanding the collpased text in the corresponding cell.

.. note::

    All tables below assumes you have imported:

    .. code-block:: python

        import fiftyone as fo
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F


Temporal
____________

.. note::
    The formulas in this table assumes the following:

    .. code-block:: python

      from datetime import datetime, timedelta

      dates = [
                datetime(2021, 8, 24, 1, 0, 0),
                datetime(2021, 8, 24, 2, 0, 0),
                datetime(2021, 8, 25, 3, 11, 12),
                datetime(2021, 9, 25, 4, 22, 23),
                datetime(2022, 9, 27, 5, 0, 0)
      ]

      filpaths = ["image1", "image2", "image3", "image4", "image5"]

      ds = fo.Dataset()

      for (date, fp) in zip(filepaths):
          sample = fo.Sample(
              filepath = fp,
              date = date
          )
          ds.add_sample(sample)
          ds.save()


+-------------------------------------------+-----------------------------------------------------------------------+
| Constraint                                | Command                                                               |
+===========================================+=======================================================================+
| After 2021-08-24 02:01:00                 | ``ds.match(F("date") > query_date)``                                  |
|                                           |                                                                       |
|                                           | .. collapse:: In the App                                              |
|                                           |                                                                       |
|                                           |   In the left-side bar, scroll down to the primitives section and     | 
|                                           |   click the down arrow in the "date" field to expand. Dragging the    |
|                                           |   ends of the slider allows you to specify the range of dates. In this|
|                                           |   case, drag the left side to the first option after 2021-08-24.      |
+-------------------------------------------+-------------------------------------------+---------------------------+
| Within 30 minutes of 2021-08-24 02:01:00  | ``ds.match(abs(F("date") - query_date) < query_delta)``               |
+-------------------------------------------+-------------------------------------------+---------------------------+
| On the 24th of the month                  | ``ds.match(F("date").day_of_month() == 24)``                          |
+-------------------------------------------+-------------------------------------------+---------------------------+
| On even day of the week                   | ``ds.match(F("date").day_of_week() % 2 == 0)``                        |
+-------------------------------------------+-------------------------------------------+---------------------------+
| On the 268th day of the year              | ``ds.match(F("date").day_of_year() == 268)``                          |
+-------------------------------------------+-------------------------------------------+---------------------------+
| In the 9th month of the year (September)  | ``ds.match(F("date").month() == 9)``                                  |
+-------------------------------------------+-------------------------------------------+---------------------------+
| In the 38th week of the year              | ``ds.match(F("date").week() == 38)``                                  |
+-------------------------------------------+-------------------------------------------+---------------------------+
| In the year 2022                          | ``ds.match(F("date").year() == 2022)``                                |
|                                           |                                                                       |
|                                           | .. collapse:: In the App                                              |
|                                           |                                                                       |
|                                           |   In the left-side bar, scroll down to the primitives section and     | 
|                                           |   click the down arrow in the "date" field to expand. Drag the left   |
|                                           |   and right ends of the slider to only encompass dates in 2022.       |
+-------------------------------------------+-------------------------------------------+---------------------------+
| With minute not equal to 0                | ``ds.match(F("date").minute() != 0)``                                 |
+-------------------------------------------+-------------------------------------------+---------------------------+



Geo/spatial
____________

.. note::
    The formulas in this table assumes the following:

    .. code-block:: python

      from datetime import datetime, timedelta

      MANHATTAN = [
          [
              [-73.949701, 40.834487],
              [-73.896611, 40.815076],
              [-73.998083, 40.696534],
              [-74.031751, 40.715273],
              [-73.949701, 40.834487],
          ]
      ]

      TIMES_SQUARE = [-73.9855, 40.7580]

      ds = foz.load_zoo_dataset("quickstart-geo")

+-------------------------------------------+-----------------------------------------------------------------------+
| Constraint                                | Command                                                               |
+===========================================+=======================================================================+
| Within 5km of Times Square                | ``ds.geo_within(MANHATTAN, max_distance=5000)``                       |
+-------------------------------------------+-------------------------------------------+---------------------------+
| Within Manhattan                          | ``ds.geo_within(MANHATTAN)``                                          |
+-------------------------------------------+-------------------------------------------+---------------------------+


Strings, regex, and pattern matching
____________________________________

.. note::
    The formulas in this section assume the following:

    .. code-block:: python

      ds = foz.load_zoo_dataset("quickstart")

+-------------------------------------------+-----------------------------------------------------------------------+
| Constraint                                | Command                                                               |
+===========================================+=======================================================================+
| Filepath starts with "/Users"             | ``ds.match(F("filepath").starts_with("/Users"))``                     |
+-------------------------------------------+-------------------------------------------+---------------------------+
| Filepath ends with "10.jpg" or "10.png"   | ``ds.match(F("filepath").ends_with(("10.jpg", "10.png")))``           |
+-------------------------------------------+-------------------------------------------+---------------------------+
| Label contains string "be"                | ``ds.filter_labels("predictions", F("label").contains_str("be"))``    |
+-------------------------------------------+-------------------------------------------+---------------------------+
| has "088" in filepath and is JPEG         | ``ds.match(F("filepath").re_match("088*.jpg"))``                      |
+-------------------------------------------+-------------------------------------------+---------------------------+


Detections
____________

.. note::
    The formulas in this section assume the following:

    .. code-block:: python

      ds = foz.load_zoo_dataset("quickstart")

   
+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Command                                                                 |
+===========================================+=========================================================================+
| Predictions with confidence > 0.95        | ``filter_labels("predictions", F("confidence") > 0.95)``                |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left-side bar, scroll down to the labels section and click on  | 
|                                           |   the down arrow in the "predictions" label field to expand. Samples can|
|                                           |   be specified by values in the "confidence" field via the horizontal   |
|                                           |   selection bar. Drag the circle on the right side of this bar to 0.95. |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *Exactly* n ground truth detections       | ``ds.match(F("ground_truth.detections").length() == n)``                |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *At least* one dog                        | ``ds.match(F("ground_truth.detections.label").contains("dog"))``        |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left-side bar, scroll down to the labels section and click on  | 
|                                           |   the down arrow in the "ground truth" label field to expand. Click into|
|                                           |   the "+ filter by label" field and select "dog" from the dropdown.     |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Images that *do not* contain dogs         | ``ds.match(~F("ground_truth.detections.label").contains("dog"))``       |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   Same as for "At least one dog", but at the end, switch the selection  | 
|                                           |   mode for the label field from "Select" to "Exclude".                  |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *Only* get dog detections                 | ``ds.filter_labels("ground_truth", F("label") == "dog")``               |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   Click on the Bookmark icon above the sample grid and select           | 
|                                           |   "ground truth". In the labels section of the left side-bar, expand the|
|                                           |   "ground_truth" label field, click into the "+ filter by label" cell,  |
|                                           |   select "dog" from the dropdown.                                       |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Images that *only* contain dogs           | ``ds.match(F("ground_truth.detections.label").is_subset(["dog"]))``     |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Contains *either* a cat *or* a dog        | ``ds.match(F("predictions.detections.label").contains(["cat","dog"])``  |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   Same as for "At least one dog", but afte selecting "dog" from the     | 
|                                           |   dropdown, click back into the "+ filter by label" field and select    |
|                                           |   "cat" from the dropdown. After this, both "cat" and "dog" should      |
|                                           |   appear with checkboxes in this section.                               |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Contains a cat *and* a dog prediction     | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    ds.match(                                                            |
|                                           |        F("predictions.detections.label").contains(                      |
|                                           |            ["cat", "dog"],                                              |
|                                           |            all = True                                                   |
|                                           |        )                                                                |
|                                           |    )                                                                    |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Contains a cat or dog but not both (XOR)  | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    field = "predictions.detections.label"                               |
|                                           |    class_list = ["cat", "dog"]                                          |
|                                           |    contains_one_filter = F(field).contains(class_list)                  |
|                                           |    contains_both_filter = F(field).contains(class_list, all=True)       |
|                                           |    ds.match(contains_one_filter & ~contains_both_filter)                |
+-------------------------------------------+-------------------------------------------+-----------------------------+



Bounding boxes
---------------

.. note::

    The code in the following table uses the following variables:


    .. code-block:: python

      width, height = F("bounding_box")[2], F("bounding_box")[3]
      relative_bbox_area = width * height

      meta_width, meta_height = F("$metadata.width"), F("$metadata.height")
      absolute_bbox_area = relative_bbox_area * meta_width * meta_height

      ## example values
      lower_bound, upper_bound = 0.25, 0.75
      max_num_pixels = 96**2
  


+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint on bounding boxes              | Command                                                                 |
+===========================================+=========================================================================+
| Larger than absolute size                 | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    ds.filter_labels("predictions", absolute_bbox_area >area_cutoff      |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Between two relative sizes                | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    lower_bound, upper_bound = 0.25, 0.75                                |
|                                           |    good_bboxes = (relative_bbox_area > lower_bound) &                   |
|                                           |                     (relative_bbox_area < upper_bound)                  |
|                                           |    good_bboxes_filter = bbox_area.let_in(good_bboxes)                   |
|                                           |    ds.filter_labels("predictions", good_bboxes_filter                   |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Approximately square                      | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    rectangleness = abs(                                                 |
|                                           |        width * meta_width -                                             |
|                                           |        height * meta_height -                                           |
|                                           |    )                                                                    |
|                                           |    ds.select_fields("predictions").filter_labels(                       |
|                                           |        "predictions",                                                   |
|                                           |        rectangleness <= 1                                               |
|                                           |    )                                                                    |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Aspect ratio > 2                          | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    aspect_ratio = ((width * meta_width) / (height * meta_height)        |
|                                           |    ds.select_fields("predictions").filter_labels(                       |
|                                           |        "predictions",                                                   |
|                                           |        aspect_ratio > 2                                                 |
|                                           |    )                                                                    |
+-------------------------------------------+-------------------------------------------+-----------------------------+


Evaluating Detections
----------------------

.. note::

    The code in the following table uses the following lines have been run on a dataset ``ds`` with predictions

    .. code-block:: python

      ds.evaluate_detections("predictions", eval_key = "eval")

      import fiftyone.brain as fob
      fob.compute_uniqueness(ds)
      fob.compute_mistakenness(ds, "predictions", label_field="ground_truth")
      ep = ds.to_evaluation_patches("eval")

 
 
+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Command                                                                 |
+===========================================+=========================================================================+
| Uniqueness > 0.9                          | ``ds.match(F("uniqueness") > 0.9)``                                     |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left-side bar, scroll down to the primitives section and click | 
|                                           |   on the down arrow in the "uniqueness" field to expand. Samples can be |
|                                           |   specified by values in the "uniqueness" field via the horizontal      |
|                                           |   selection bar. Drag the circle on the right side of this bar to 0.9.  |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| 10 most unique images                     | ``ds.sort_by("uniqueness", reverse=True)[:10]``                         |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the view bar, click "Add Stage". Scroll down to "SortBy". In the   | 
|                                           |   blank field that appears, type "uniqueness" and click "Submit". In the|
|                                           |   next field, type "True". Click on the "+" to concatenate view stages. |
|                                           |   Scroll down to "Limit", and in the "int" field enter 10. Hit return.  |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Predictions with confidence > 0.95        | ``filter_labels("predictions", F("confidence") > 0.95)``                |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left-side bar, scroll down to the labels section and click on  | 
|                                           |   the down arrow in the "predictions" label field to expand. Samples can|
|                                           |   be specified by values in the "confidence" field via the horizontal   |
|                                           |   selection bar. Drag the circle on the right side of this bar to 0.95. |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| 10 most "wrong" predictions               | ``ds.sort_by("mistakenness", reverse=True)[:10]``                       |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the view bar, click "Add Stage". Scroll down to "SortBy". In the   | 
|                                           |   blank field that appears, type "mistakenness" and click "Submit". In  |
|                                           |   the next field, type "True". Click on the "+" to concatenate view |
|                                           |   stages. Scroll down to "Limit", and in the "int" field enter 10. Hit  |
|                                           |   return.                                                               |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Images with more than 10 false positives  | ``ds.match(F("eval_fp") > 10)``                                         |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left-side bar, scroll down to the primitives section and click | 
|                                           |   on the down arrow in the "eval_fp" field to expand. Drag the circle on|
|                                           |   the left side of this bar to 10.                                      |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| False positives "dog" detections          | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    ep.match_labels(                                                     |
|                                           |       filter = (F("eval") == "fp") & (F("label") == "dog"),             |
|                                           |       fields = "predictions"                                            |
|                                           |    )                                                                    |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   Click on the Patches icon, toggle over from Labels to Evaluations, and|
|                                           |   select "eval" from the dropdown, then click on the Bookmark icon to   |
|                                           |   save this view as a ViewStage. In the left-side bar, scroll down to   | 
|                                           |   primitives section and click, expand the "type" cell, and select "fp".|
|                                           |   Scroll up to the Labels section, expand the "predictions" cell, click |
|                                           |   in the "+ filter by label" field, and select "dog" from the dropdown. |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Predictions with IoU > 0.9                | ``ep.match(F("iou") > 0.9)``                                            |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   Click on the Patches icon, toggle over from Labels to Evaluations, and|
|                                           |   select "eval" from the dropdown. This should populate the grid view   |
|                                           |   with evaluation patches. Next, go over to the left side-bar and in the|
|                                           |   primitives section, expand the "iou" cell. Drag the right side of the |
|                                           |   bar from 1.0 to 0.9.                                                  |
+-------------------------------------------+-------------------------------------------+-----------------------------+


Classification
_______________

.. note::
    The formulas in this section assume the following:

    .. code-block:: python

      ds = foz.load_zoo_dataset("cifar10", split="test")

    And that you have added your own predicted classifications in a "predictions" field.


Evaluating classification
--------------------------

.. note::

    The code in the following table uses the following lines have been run on a dataset ``ds``, where the predictions 
    field is populated with classification predictions that include a "logits" field.

    .. code-block:: python

      ds.evaluate_classifications("predictions")

      import fiftyone.brain as fob
      fob.compute_uniqueness(ds)
      fob.compute_hardness(ds, "predictions")
      fob.compute_mistakenness(ds, "predictions", label_field="ground_truth")



+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Command                                                                 |
+===========================================+=========================================================================+
| 10 most unique incorrect predictions      | .. code-block:: python                                                  |
|                                           |                                                                         |
|                                           |    ds.match(                                                            |
|                                           |       F("predictions.label") != F("ground_truth.label")                 |
|                                           |    ).sort_by("uniqueness", reverse=True)[:10]                           |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the left side-bar, scroll down to the primitives section and       | 
|                                           |   expand the "eval" section. Select the checkbox next to "False".       |
|                                           |   Directly above the sample grid, click the Bookmark icon to convert the|
|                                           |   current view to a view stage in the view bar. Now go up to the view   |
|                                           |   bar, click on "+ add stage", and add "SortBy" uniqueness, and then    |
|                                           |   "Limit" to 10.                                                        |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| 10 most "wrong" predictions               | ``ds.sort_by("mistakenness", reverse=True)[:10]``                       |
|                                           |                                                                         |
|                                           | .. collapse:: In the App                                                |
|                                           |                                                                         |
|                                           |   In the view bar, click "Add Stage". Scroll down to "SortBy". In the   | 
|                                           |   blank field that appears, type "mistakenness" and click "Submit". In  |
|                                           |   the next field, type "True". Click on the "+" to concatenate view |
|                                           |   stages. Scroll down to "Limit", and in the "int" field enter 10. Hit  |
|                                           |   return.                                                               |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| 10 most likely annotation mistakes        | ``ds.match_tags("train").sort_by("mistakenness, reverse = True)[:10]``  |
+-------------------------------------------+-------------------------------------------+-----------------------------+


Built-in filter and match functions
____________________________________

FiftyOne has special methods for matching and filtering on specific data types. 
Take a look at the examples in this section to see how various operations can
be performed via these special purpose methods, and compare that to the brute
force implementation of the same operation that follows.


Filtering keypoints with ``filter_keypoints()``
--------------------------------------------------

.. note::

    The table in this section uses the following example dataset:

    .. code-block:: python

      ds = fo.Dataset()
      ds.add_samples(
          [
              fo.Sample(
                  filepath="/path/to/image1.png",
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
              fo.Sample(filepath="/path/to/image2.png"),
          ]
      )

      ds.default_skeleton = fo.KeypointSkeleton(
          labels=["nose", "left eye", "right eye", "left ear", "right ear"],
          edges=[[0, 1, 2, 0], [0, 3], [0, 4]],
      )



+---------------+-----------------------------------------------------------------------------------------------------+
| Constraint    | Only include predicted keypoints with confidence > 0.9                                              |
+---------------+-----------------------------------------------------------------------------------------------------+
| Idiomatic     | ``view = ds.filter_keypoints("predictions", filter=F("confidence") > 0.9)``                         |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |   .. code-block:: python                                                                            |
|               |                                                                                                     |
|               |     view = ds.clone()                                                                               |
|               |     for sample in dataset.iter_samples(autosave = True):                                            |
|               |         if "predictions" not in sample or sample.predictions is None:                               |
|               |             continue                                                                                |
|               |         if "keypoints" not in sample["predictions"] or sample.predictions.keypoints is None:        |
|               |             continue                                                                                |
|               |         keypoints = sample.predictions.keypoints                                                    |
|               |         for keypoint in keypoints:                                                                  |
|               |             for i, c in enumerate(keypoint.confidence):                                             |
|               |                 if c < 0.9:                                                                         |
|               |                     keypoint.points[i] = [None, None]                                               |
+---------------+-----------------------------------------------------------------------------------------------------+


Matching frames with ``match_frames()``
------------------------------------------

.. note::

    The following table uses the "quickstart-video" dataset as ``ds`` and assumes the following:

    .. code-block:: python

      ds = foz.load_zoo_dataset("quickstart-video")
      num_objects = F("detections.detections").length()



+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Samples that have a frame with at least 10 detections                   |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Idiomatic                                 | ``ds.match_frames(num_objects > 10)``                                   |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Brute force                               | ``ds.match(F("frames").filter(num_objects > 10).length()>0)``           |
+-------------------------------------------+-------------------------------------------+-----------------------------+


.. note::

    The rest of the tables in this section use the "quickstart" dataset as ``ds`` and assume the following:

    .. code-block:: python

      ds = foz.load_zoo_dataset("quickstart")
      
      ### tag a few random samples to illustrate matching tags
      ds.take(3).tag_labels("potential_mistake", label_fields="predictions")

      ### select a few sample ids to illustrate matching labels on ids

      my_ids = [
          dataset.first().ground_truth.detections[0].id,
          dataset.last().predictions.detections[0].id,
      ]
      ds.select_labels(ids=ids).tag_labels("error")
      ds.save()

      ### create an example filter
      len_filter = F("label").strlen() < 3


Filtering labels with ``filter_labels()``
------------------------------------------

+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Get predicted detections that have confidence > 0.9                     |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Idiomatic                                 | ``ds.filter_labels("predictions", F("confidence") > 0.9)``              |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Brute force                               | **TO DO**                                                               |
+-------------------------------------------+-------------------------------------------+-----------------------------+



Matching labels with ``match_labels()``
------------------------------------------

+---------------+-----------------------------------------------------------------------------------------------------+
| Constraint    | Samples that have labels with ``id``s in the list ``my_ids``                                        |
+---------------+-----------------------------------------------------------------------------------------------------+
| Idiomatic     | ``ds.match_labels(ids=ids)``                                                                        |
+---------------+-----------------------------------------------------------------------------------------------------+
| Brute force   | **TO DO**                                                                                           |
+---------------+-----------------------------------------------------------------------------------------------------+


+---------------+-----------------------------------------------------------------------------------------------------+
| Constraint    | Samples that have labels satisfying ``len_filter`` in ``predictions`` or ``ground_truth`` field     |
+---------------+-----------------------------------------------------------------------------------------------------+
| Idiomatic     | ``view = ds.match_labels(filter=len_filter, fields=["predictions", "ground_truth"])``               |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |   .. code-block:: python                                                                            |
|               |                                                                                                     |
|               |     view = ds.clone()                                                                               |
|               |     pred_match = F("predictions.detections").filter(len_filter).length() > 0                        |
|               |     gt_match = F("ground_truth.detections").filter(len_filter).length() > 0                         |
|               |     ds.match(pred_match \| gt_match)                                                                |
+---------------+-----------------------------------------------------------------------------------------------------+

+---------------+-----------------------------------------------------------------------------------------------------+
| Constraint    | Samples that have labels with tag "error" in ``predictions`` or ``ground_truth`` field              |
+---------------+-----------------------------------------------------------------------------------------------------+
| Idiomatic     | ``ds.match_labels(tags="error")``                                                                   |
+---------------+----------------------+------------------------------------------------------------------------------+
| Brute force   |   .. code-block:: python                                                                            |
|               |                                                                                                     |
|               |     pred_match = F("predictions.detections").filter(F("tags").contains("error")).length()>0         |
|               |     gt_match = F("ground_truth.detections").filter(F("tags").contains("error")).length()>0          |
|               |     ds.match(pred_match \| gt_match)                                                                |
+---------------+-----------------------------------------------------------------------------------------------------+

Matching tags with ``match_tags()``
------------------------------------------

+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Samples that have tag ``validation``                                    |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Idiomatic                                 | ``ds.match_tags("validation")``                                         |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Brute force                               | ``ds.match(F("tags").contains("validation"))``                          |
+-------------------------------------------+-------------------------------------------+-----------------------------+












