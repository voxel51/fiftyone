.. _viewstage-cheat-sheet:

A cheat sheet showing how to get the view you're looking for in your data using FiftyOne View Stages! 

View Stages Cheat Sheet
===========================

In this cheat sheet, we'll go over all of the view stages that are available for FiftyOne datasets and dataset views, and how to use them to masterfully massage your data.


The Seven Basic Operations
___________________________

If you run ``print(dataset.list_view_stages())``, you'll get a list of all FiftyOne View Stage methods you can use
to get views of your dataset. With a few exceptions (which we'll cover later), these methods can be organized into seven
categories: selection, exclusion, matching, filtering, sorting, indexing, and converting to another format.

Selection
----------

Select certain subsets of the dataset to *include* in the view.

.. list-table:: Select methods

   * - :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
   * - :meth:`select_by() <fiftyone.core.collections.SampleCollection.select_by>`
   * - :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
   * - :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`
   * - :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
   * - :meth:`select_group_slices() <fiftyone.core.collections.SampleCollection.select_group_slices>`
   * - :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`

Exclusion
----------

Select certain subsets of the dataset to *exclude* from the view.

.. list-table:: Exclude methods

   * - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
   * - :meth:`exclude_by() <fiftyone.core.collections.SampleCollection.exclude_by>`
   * - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
   * - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
   * - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`


Matching
----------

Select certain subsets of the dataset that match given conditions.

.. list-table:: Match methods

   * - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
   * - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
   * - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
   * - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`


Filtering
----------

Create a view where the contents of samples in the original dataset are filtered based on given conditions.

.. list-table:: Filter methods

   * - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
   * - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
   * - :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`

Sorting
----------

Sort the samples in the dataset based on a given condition.

.. list-table:: Sort methods

   * - :meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`
   * - :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`


Indexing
----------

Slice and reorder the samples in a dataset.

.. list-table:: Indexing methods

   * - :meth:`limit() <fiftyone.core.collections.SampleCollection.limit>`
   * - :meth:`shuffle() <fiftyone.core.collections.SampleCollection.shuffle>`
   * - :meth:`skip() <fiftyone.core.collections.SampleCollection.skip>`
   * - :meth:`take() <fiftyone.core.collections.SampleCollection.take>`

Conversion
----------

Create a view of a different kind - either different media type or basic elements - from the dataset samples.

.. list-table:: Conversion (to) methods

   * - :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
   * - :meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
   * - :meth:`to_clips() <fiftyone.core.collections.SampleCollection.to_clips>`
   * - :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`






