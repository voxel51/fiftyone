.. _viewstage-cheat-sheet:

A cheat sheet showing how to get the view you're looking for in your data using 
FiftyOne View Stages! 

View Stages Cheat Sheet
===========================

In this cheat sheet, we'll go over all of the view stages that are available for 
FiftyOne datasets and dataset views, and how to use them to masterfully massage 
your data.


The Seven Basic Operations
___________________________

If you run ``print(dataset.list_view_stages())``, you'll get a list of all 
FiftyOne View Stage methods you can use to get views of your dataset. With a few
exceptions (which we'll cover later), these methods can be organized into seven
categories: matching, filtering, selection, exclusion, indexing, and converting 
to another format.


Matching
----------

Select certain subsets of the dataset that match given conditions, without 
modifying the contents of the samples.

.. list-table:: Match methods

   * - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
   * - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
   * - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
   * - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`


Filtering
----------

Create a view where the contents of samples in the original dataset are filtered 
based on given conditions.

.. list-table:: Filter methods

   * - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
   * - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
   * - :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`

Selection
----------

Select certain subsets of the dataset to *include* in the view based on 
identifiers.



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

Select certain subsets of the dataset to *exclude* from the view based on 
identifiers. Selection and exclusion are complementary operations.

.. list-table:: Exclude methods

   * - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
   * - :meth:`exclude_by() <fiftyone.core.collections.SampleCollection.exclude_by>`
   * - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
   * - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
   * - :meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`
   * - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`


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

Create a view of a different kind - either different media type or basic 
elements - from the dataset samples.

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

Simply put, it's all about helping you perform your computer vision workflows as
easily and efficiently as possible. These methods allow you to get the data 
you're looking for without iterating through all samples (and potentially all
frames, fields, labels, etc.) by giving you direct access to the attributes 
you are interested in.

.. list-table:: Supported methods by primitive
   :widths: 40 50 50 50 50
   :header-rows: 1
   :stub-columns: 1

   * - 
     - **Match**
     - **Filter**
     - **Select**
     - **Exclude**
   * - **Samples**
     - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
     - 
     - :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
     - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
   * - **Labels**
     - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
     - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
     - :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`
     - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
   * - **Fields**
     - 
     - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
     - :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
     - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
   * - **Tags**
     - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
     - 
     - 
     - 
   * - **Frames**
     - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
     - 
     - :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`
     - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
   * - **Groups**
     - 
     - 
     - :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
     - :meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`
    




Looking at the above table, we can see that most of these operations are 
supported on these primitives directly via tailored methods. There are a few 
notable absences, which we will cover presently. At a high level, these empty 
entries in the table fall into two categories: (1) the operation does not make 
sense on the primitive, or (2) the operation on this primitive can easily 
applied via the base method.

In the following sections, we fill in the gaps in the table, primitive by primitive:

Samples
^^^^^^^^

The only method missing from the `Samples` row of the table is a ``filter()`` 
method. This is because filtering operations create a view with contents of the
primitive to which they are applied. However, as samples are comprised of 
fields, the ``filter_field()`` provides all of the desired functionality.


Fields
^^^^^^^
The only missing entry in the `Fields` row is ``match_fields()``. Such a method
would absolutely make sense - matches on fields are common. However, you can 
achieve the exact same effect using the basic ``match()`` method. 

Drawing analogy with the other matching operations, a hypothetical
``match_fields()`` method would take as input a `field` and a `filter`. To 
achieve this effect, we can apply
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` to the field on which we have applied the filter via the `ViewField`'s `apply()` method.

.. code-block:: python

   # what a match_field() method would look like
   view = dataset.match_field(field, filter)

   # generate the same view with existing methods
   from fiftyone import ViewField as F
   view = dataset.match(F(field).apply(expr))

It is also worth noting that 
:meth:`exists() <fiftyone.core.collections.SampleCollection.exists>` can be 
viewed as a special case of the hypothetical ``match_fields()`` method. The 
:meth:`exists() <fiftyone.core.collections.SampleCollection.exists>` method 
returns only the samples on which the field exists, hence the method name.
This is equivalent to matching on fields with the trivial filter ``F()``.

Tags
^^^^^

All three of the remaining `Tag` methods can be created with relative ease.

Here's what ``select_tags()`` might look like:

.. code-block:: python

   # what a select_tags() method would look like
   view = dataset.select_tags(tags)

   # generate the same view with existing methods
   from fiftyone import ViewField as F
   view = dataset.set_field(
      "tags",
      F("tags").intersection(tags)
   )

And here's what the very similar ``exclude_tags()`` method would look like:

.. code-block:: python

   # what an exclude_tags() method would look like
   view = dataset.exclude_tags(tags)

   # generate the same view with existing methods
   from fiftyone import ViewField as F
   view = dataset.set_field(
      "tags",
      F("tags").difference(tags)
   )

These two implementations use the set intersection and set difference methods.



**TO DO**
``filter_tags()`` - I tried using ``set_field()`` and ``map()``, but ended up
with an array of True/False values for each sample, with one element per tag
like [True False True]

Frames
^^^^^^^


Groups
^^^^^^^

The *Groups* row, noticeably, is missing both the ``match_groups()`` and 
``filter_groups()`` methods. This is because in practice, the majority of the
filtering and matching operations one might want to perform on Grouped Datasets
can be accomplished by performing filtering and matching operations on specific
slices of the dataset.

For instance, if we wanted to filter the labels of the :ref:`Quickstart Groups Dataset<dataset-zoo-quickstart-groups>` for only ``"Pedestrian"`` labels, we could do so
by creating a stage that encapsulates this logic, and iterating through all of
the group slices:

.. code-block:: python

      import fiftyone as fo
      import fiftyone.zoo as foz
      from fiftyone import ViewField as F

      dataset = foz.load_zoo_dataset("quickstart-groups")

      ## create the stage we will apply to all group slices
      stage = fo.FilterLabels("ground_truth", F("label") == "Pedestrian")

      view = fo.DatasetView(dataset)
      ## iterate through group slices
      for gs in dataset.group_slices:
          dataset.group_slice = gs
          view = view.add_stage(stage)




