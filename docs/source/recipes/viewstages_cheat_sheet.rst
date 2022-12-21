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
   * - ``exclude_groups()``
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

Miscellaneous
--------------

All other view stage methods, which do not fit into these seven buckets:

.. list-table:: Conversion (to) methods

   * - :meth:`concat() <fiftyone.core.collections.SampleCollection.concat>`
   * - :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>`
   * - :meth:`geo_near() <fiftyone.core.collections.SampleCollection.geo_near>`
   * - :meth:`geo_within() <fiftyone.core.collections.SampleCollection.geo_within>`
   * - :meth:`map_labels() <fiftyone.core.collections.SampleCollection.map_labels>`
   * - :meth:`mongo() <fiftyone.core.collections.SampleCollection.mongo>`
   * - :meth:`set_field() <fiftyone.core.collections.SampleCollection.set_field>`


Why so many related methods?
------------------------------

Simply put, it's all about helping you perform your computer vision workflows as easily and efficiently as possible. 
These methods allow you to get the data you're looking for without iterating through all samples (and potentially all
frames, fields, labels, etc.) by giving you direct access to the attributes you are interested in.


.. list-table:: Supported methods by primitive
   :widths: 40 50 50 50 50
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **Select**
     - **Exclude**
     - **Match**
     - **Filter**
   * - **Samples**
     - :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
     - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
     - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
     - 
   * - **Labels**
     - :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`
     - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
     - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
     - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
   * - **Fields**
     - :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
     - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
     - :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>`
     - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
   * - **Tags**
     - 
     - 
     - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
     - 
   * - **Frames**
     - :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`
     - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
     - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
     - 
   * - **Groups**
     - :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
     - ``exclude_groups()``
     - 
     - 


Looking at the above table, we can see that most of these operations are supported on these primitives directly via tailored methods. There are a few notable absences, which we will cover presently. At a high level, these empty entries in the table fall into two categories: (1) the operation does not make sense on the primitive, or (2) the operation on this primitive can easily applied via the base method.

Samples
^^^^^^^^

The only method missing from the `Samples` row of the table is a ``filter*()`` method. **Such an operation does not make sense, because...**


Fields
^^^^^^^

For `Fields`, notice that in lieu of ``match_fields()`` the table contains ``exists()``. A matching operation on fields would, in theory, return samples that contain a specific field. This is equivalent to getting the samples on which the field exists. **Rename or alias from match_fields() to exists()**????

Tags
^^^^^

Selecting and excluding tags are not sensible means of creating dataset views, as the ``select*()`` and ``exclude*()`` families of operations are meant to be applied to fields which contain embedded subfields. **SOMETHING ABOUT FILTERING and match_tags...**

Frames
^^^^^^^

**Missing ``filter_frames()``. This might actually be a useful method to add!** Can see some 

Groups
^^^^^^^

I was originally thinking that you don't need match and filter operations for groups because everything on a grouped dataset can be accomplished by breaking it down into group slices and doing matching and filtering on these slices. However... I'm starting to think it might be helpful to build in these methods because they can be much easier than switching back and forth between group slices or needing to store all of the intermediate data.

Just a simple examples:

If you have "left", "center", and "right" slices, but not every group has samples on all three slices. You might want to check with something like ``match_groups(group_field, F().length() == 3)``? Not sure if this merits a new method though..







