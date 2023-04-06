.. _views-cheat-sheet:

Views Cheat Sheet
=================

.. default-role:: code

This cheat sheet shows how to use :ref:`dataset views <using-views>` to
retrieve the specific subset of data you're looking for.

The six basic operations
________________________

If you run:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()
    print(dataset.list_view_stages())

you'll see a list of all |ViewStage| methods that you can use to construct
views into your datasets.

With a few exceptions (which we'll cover later), these methods can be organized
into six categories: matching, filtering, selection, exclusion, indexing, and
conversion.

Matching
--------

These stages select certain subsets of the input collection that match a given
condition, without modifying the contents of the samples.

.. list-table::

   * - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
   * - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
   * - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
   * - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`

Filtering
---------

These stages filter the contents of the samples in the input collection based
on a given condition.

.. list-table::

   * - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
   * - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
   * - :meth:`filter_keypoints() <fiftyone.core.collections.SampleCollection.filter_keypoints>`

Selection
---------

These stages select certain subsets of the input collection that contain a
given identifier.

Selection is similar to matching/filtering, but with a simpler syntax that
supports specific selection criteria (common identifiers like IDs and tags)
rather than arbitrary :ref:`expressions <querying-samples>`.

.. list-table::

   * - :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
   * - :meth:`select_by() <fiftyone.core.collections.SampleCollection.select_by>`
   * - :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
   * - :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`
   * - :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
   * - :meth:`select_group_slices() <fiftyone.core.collections.SampleCollection.select_group_slices>`
   * - :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`

Exclusion
---------

These stages exclude data from the input collection based on the given
criteria.

.. list-table::

   * - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
   * - :meth:`exclude_by() <fiftyone.core.collections.SampleCollection.exclude_by>`
   * - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
   * - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
   * - :meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`
   * - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`

Sorting
-------

These stages sort the samples in the input collection based on a given condition.

.. list-table::

   * - :meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`
   * - :meth:`sort_by_similarity() <fiftyone.core.collections.SampleCollection.sort_by_similarity>`

Indexing
--------

These stages slice and reorder the samples in the input collection.

.. list-table::

   * - :meth:`limit() <fiftyone.core.collections.SampleCollection.limit>`
   * - :meth:`shuffle() <fiftyone.core.collections.SampleCollection.shuffle>`
   * - :meth:`skip() <fiftyone.core.collections.SampleCollection.skip>`
   * - :meth:`take() <fiftyone.core.collections.SampleCollection.take>`

Conversion
----------

These stages create views that transform the contents of the input collection
into a different shape.

.. list-table::

   * - :meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>`
   * - :meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
   * - :meth:`to_clips() <fiftyone.core.collections.SampleCollection.to_clips>`
   * - :meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`

Miscellaneous
-------------

Other stages that do not fit into the six buckets above include:

.. list-table::

   * - :meth:`concat() <fiftyone.core.collections.SampleCollection.concat>`
   * - :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>`
   * - :meth:`geo_near() <fiftyone.core.collections.SampleCollection.geo_near>`
   * - :meth:`geo_within() <fiftyone.core.collections.SampleCollection.geo_within>`
   * - :meth:`group_by() <fiftyone.core.collections.SampleCollection.group_by>`
   * - :meth:`map_labels() <fiftyone.core.collections.SampleCollection.map_labels>`
   * - :meth:`mongo() <fiftyone.core.collections.SampleCollection.mongo>`
   * - :meth:`set_field() <fiftyone.core.collections.SampleCollection.set_field>`

Filtering, matching, selecting, and excluding
_____________________________________________

FiftyOne's goal is to help you perform your computer vision workflows as
simply and efficiently as possible, without the need to manually iterate
through all the samples in your dataset.

To achieve this, FiftyOne provides builtin view stages tailored for each
primitive data type (samples, labels, fields, tags, frames, and groups) that
provide concise syntaxes for performing the desired operation against that
primitive's attributes.

.. list-table::
   :widths: 40 50 50 50 50
   :header-rows: 1
   :stub-columns: 1

   * - 
     - Match
     - Filter
     - Select
     - Exclude
   * - Samples
     - :meth:`match() <fiftyone.core.collections.SampleCollection.match>`
     - 
     - :meth:`select() <fiftyone.core.collections.SampleCollection.select>`
     - :meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>`
   * - Labels
     - :meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`
     - :meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
     - :meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`
     - :meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
   * - Fields
     - 
     - :meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
     - :meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
     - :meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
   * - Tags
     - :meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
     - 
     - 
     - 
   * - Frames
     - :meth:`match_frames() <fiftyone.core.collections.SampleCollection.match_frames>`
     - 
     - :meth:`select_frames() <fiftyone.core.collections.SampleCollection.select_frames>`
     - :meth:`exclude_frames() <fiftyone.core.collections.SampleCollection.exclude_frames>`
   * - Groups
     - 
     - 
     - :meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
     - :meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`

From the table above, we see that most operations on each primitive type are
directly supported via tailored methods. The empty cells in the table fall into
two categories:

-   the operation does not make sense on the primitive
-   the operation can easily achieved on the primitive via another base method

In the following sections, we'll fill in the gaps in the table.

Samples
-------

The only method missing from the `Samples` row of the table is a "filter"
method. This is because filtering operations create a view with contents of the
primitive to which they are applied. However, as samples are comprised of
fields, the
:meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
method provides all of the desired functionality.

Labels
------

While all of the methods in the `Labels` row are filled in, there is one 
subtlety: filtering by ``id``.

The
:meth:`match_labels() <fiftyone.core.collections.SampleCollection.match_labels>`,
:meth:`select_labels() <fiftyone.core.collections.SampleCollection.select_labels>`,
and
:meth:`exclude_labels() <fiftyone.core.collections.SampleCollection.exclude_labels>`
methods all allow you to pass in a list of IDs to define a view. However, in
order to filter by ID using
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`,
you'll need to make two changes when creating your filter expression:

-   use ``"_id"`` rather than ``"id"`` when referencing ID fields
-   cast ID strings to ``ObjectId()``

The following example demonstrates how to correctly filter by label IDs:

.. code-block:: python
    :linenos:

    from bson import ObjectId

    import fiftone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    label_id = dataset.first().predictions.detections[0].id

    view = dataset.filter_labels("predictions", F("_id") == ObjectId(label_id))

Fields
------

The only missing entry in the `Fields` row is a "match" stage. Such a method
would absolutely make sense: matches on fields are common. However, a dedicated
method is not necessary because you can easily achieve this using the existing
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` method.

A hypothetical match fields method would take as input a ``field`` and a
``filter`` to apply to it, but we can achieve this in multiple ways via simple
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` expressions:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    field = "ground_truth.detections"
    filter = F().length() > 0

    # What a `match_fields()` method would look like
    # view = dataset.match_fields(field, filter)

    # Option 1: directly apply the filter to the field
    view = dataset.match(F(field).length() > 0)

    # Option 2: apply() the filter to the field
    view = dataset.match(F(field).apply(filter))

Note that :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>`
is also a special case of field matching:

.. code-block:: python
    :linenos:

    dataset.take(100).set_field("uniqueness", None).save()

    # Concise syntax via `exists()`
    view = dataset.exists("uniqueness")

    # Equivalent syntax via `match()`
    view = dataset.match(F("uniqueness") != None)

Tags
----

All three of the missing `Tag` methods can be created with relative ease.

Here's how selecting tags can be achieved:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # What a select_tags() method would look like
    # view = dataset.select_tags(tags)

    # How to achieve this with existing methods
    view = dataset.set_field("tags", F("tags").intersection(tags))

Here's how excluding tags can be achieved:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # What an exclude_tags() method would look like
    # view = dataset.exclude_tags(tags)

    # How to achieve this with existing methods
    view = dataset.set_field("tags", F("tags").difference(tags))

And here's how filtering tags can be achieved:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # What a filter_tags() method would look like
    # view = dataset.filter_tags(expr)

    # How to achieve this with existing methods
    view = dataset.set_field("tags", F("tags").filter(expr))

.. note::

    The above examples use the set
    :meth:`intersection() <fiftyone.core.expressions.ViewExpression.intersection>`
    and
    :meth:`difference() <fiftyone.core.expressions.ViewExpression.difference>`
    view expressions.

Frames and groups
-----------------

When working with :ref:`frame-level <video-views>` and
:ref:`group-level <groups-filtering>` data in FiftyOne, all applicable view
stages naturally support querying against frame- or group-level fields by
prepending ``"frames."`` or ``"groups."`` to field paths, respectively.

For example, you can retrieve the frame-level object detections in the
"detections" field of the
:ref:`quickstart-video <dataset-zoo-quickstart-video>` dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video")

    view = dataset.filter_labels("frames.detections", F("label") == "vehicle")

Or when working with grouped datasets, you can match groups based on whether
they contain a given group slice:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    # Load a dataset with 200 groups, each with "left", "right", "pcd" elements
    dataset = foz.load_zoo_dataset("quickstart-groups")

    # Add 50 new groups with only "left" slice samples
    dataset.add_samples(
        [
            fo.Sample(
                filepath="image%d.png" % i,
                group=fo.Group().element("left"),
            )
            for i in range(50)
        ]
    )

    # Match groups that have "pcd" elements
    view = dataset.match(F("groups.pcd") != None)

Conversion
__________

FiftyOne provides a variety of convenient methods for converting your data
from one format to another. Some of these conversions are accomplished as view
stages that return *generated views*, which are views that contain a different
shape of data than the original |Dataset| or |DatasetView| to which the view
stage was applied.

Let's briefly cover the transformation that each generated view performs.

Images to object patches
------------------------

If your dataset contains label list fields like |Detections| or |Polylines|,
then you can use
:meth:`to_patches() <fiftyone.core.collections.SampleCollection.to_patches>` to
create views that contain one sample per object patch in a specified label
field of your dataset.

For example, you can extract patches for all ground truth objects in a
detection dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    gt_patches = dataset.to_patches("ground_truth")
    print(gt_patches)

.. code-block:: text

    Dataset:     quickstart
    Media type:  image
    Num patches: 1232
    Patch fields:
        id:           fiftyone.core.fields.ObjectIdField
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.ImageMetadata)
        sample_id:    fiftyone.core.fields.ObjectIdField
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detection)
    View stages:
        1. ToPatches(field='ground_truth', config=None)

Images to evaluation patches
----------------------------

If you have :ref:`run evaluation <evaluating-detections>` on predictions from
an object detection model, then you can use
:meth:`to_evaluation_patches() <fiftyone.core.collections.SampleCollection.to_evaluation_patches>`
to transform the dataset (or a view into it) into a new view that contains one
sample for each true positive, false positive, and false negative example.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    # Evaluate `predictions` w.r.t. labels in `ground_truth` field
    dataset.evaluate_detections(
     "predictions", gt_field="ground_truth", eval_key="eval"
    )

    # Convert to evaluation patches
    eval_patches = dataset.to_evaluation_patches("eval")
    print(eval_patches)

    print(eval_patches.count_values("type"))
    # {'fn': 246, 'fp': 4131, 'tp': 986}

.. code-block:: text

    Dataset:     quickstart
    Media type:  image
    Num patches: 5363
    Patch fields:
        id:           fiftyone.core.fields.ObjectIdField
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.ImageMetadata)
        predictions:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        sample_id:    fiftyone.core.fields.ObjectIdField
        type:         fiftyone.core.fields.StringField
        iou:          fiftyone.core.fields.FloatField
        crowd:        fiftyone.core.fields.BooleanField
    View stages:
        1. ToEvaluationPatches(eval_key='eval', config=None)

Videos to clips
---------------

You can use
:meth:`to_clips() <fiftyone.core.collections.SampleCollection.to_clips>` to
create views into your video datasets that contain one sample per clip defined
by a specific field or expression in a video collection.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-video")

    # Create a clips view that contains one clip for each contiguous segment
    # that contains at least one road sign in every frame
    clips = (
        dataset
        .filter_labels("frames.detections", F("label") == "road sign")
        .to_clips("frames.detections")
    )
    print(clips)

.. code-block:: text

   Dataset:    quickstart-video
   Media type: video
   Num clips:  11
   Clip fields:
       id:        fiftyone.core.fields.ObjectIdField
       sample_id: fiftyone.core.fields.ObjectIdField
       filepath:  fiftyone.core.fields.StringField
       support:   fiftyone.core.fields.FrameSupportField
       tags:      fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
       metadata:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.VideoMetadata)
   Frame fields:
       id:           fiftyone.core.fields.ObjectIdField
       frame_number: fiftyone.core.fields.FrameNumberField
       detections:   fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
   View stages:
       1. FilterLabels(field='frames.detections', ...)
       2. ToClips(field_or_expr='frames.detections', config=None)

Videos to images
----------------

You can use
:meth:`to_frames() <fiftyone.core.collections.SampleCollection.to_frames>`
to create image views into your video datasets that contain one sample per
frame in the input collection.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-video")

    # Create a view with one sample per frame
    frames = dataset.to_frames(sample_frames=True)
    print(frames)

.. code-block:: text

   Dataset:     quickstart-video
   Media type:  image
   Num samples: 1279
   Sample fields:
      id:           fiftyone.core.fields.ObjectIdField
      filepath:     fiftyone.core.fields.StringField
      tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
      metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.ImageMetadata)
      sample_id:    fiftyone.core.fields.ObjectIdField
      frame_number: fiftyone.core.fields.FrameNumberField
      detections:   fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
   View stages:
     1. ToFrames(config=None)

Grouped to non-grouped
----------------------

You can use the
:meth:`select_group_slices() <fiftyone.core.collections.SampleCollection.select_group_slices>`
to generate a |DatasetView| that contains a flattened collection of samples
from specific slice(s) of a grouped dataset.

For example, the following code creates an image collection from the "left" and
"right" group slices of the
:ref:`quickstart-groups <dataset-zoo-quickstart-groups>` dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-groups")

    image_view = dataset.select_group_slices(["left", "right"])
    print(image_view)

.. code-block:: text

    Dataset:     groups-overview
    Media type:  image
    Num samples: 400
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. SelectGroupSlices(slices=['left', 'right'])

.. note::

   All group slice(s) you select must have the same media type, since the
   ``media_type`` of the returned collection is the media type of the slices
   you select.
