.. _filtering-cheat-sheet:

Filtering
==================

.. default-role:: code

A cheat sheet showing how to perform matching and filtering operations in FiftyOne!

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
| Constraint                                | Code                                                                  |
+===========================================+=======================================================================+
| After 2021-08-24 02:01:00                 | ``ds.match(F("date") > query_date)``                                  |
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
+-------------------------------------------+-------------------------------------------+---------------------------+
| With minute not equal to 0                | ``ds.match(F("date").minute() != 0)``                                 |
+-------------------------------------------+-------------------------------------------+---------------------------+


Strings, regex, and pattern matching
____________________________________


+-------------------------------------------+-----------------------------------------------------------------------+
| Constraint                                | Code                                                                  |
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


+-------------------------------------------+-------------------------------------------------------------------------+
| Constraint                                | Code                                                                    |
+===========================================+=========================================================================+
| Predictions with confidence > 0.95        | ``filter_labels("predictions", F("confidence") > 0.95)``                |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *Exactly* n ground truth detections       | ``ds.match(F("ground_truth.detections").length() == n)``                |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *At least* one dog                        | ``ds.match(F("ground_truth.detections.label").contains("dog"))``        |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| *Only* get dog detections                 | ``ds.filter_labels("ground_truth", F("label") == "dog")``               |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Images that *only* contain dogs           | ``ds.match(F("ground_truth.detections.label").is_subset(["dog"]))``     |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Images that *do not* contain dogs         | ``ds.match(~F("ground_truth.detections.label").contains("dog"))``       |
+-------------------------------------------+-------------------------------------------+-----------------------------+
| Contains *either* a cat *or* a dog        | ``ds.match(F("predictions.detections.label").contains(["cat","dog"])``  |
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
| Constraint on bounding boxes              | Code                                                                    |
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








