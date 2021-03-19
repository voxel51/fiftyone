.. _using-views:

Dataset Views
=============

.. default-role:: code

FiftyOne provides methods that allow you to sort, slice, and search your
|Dataset| using any information that you have added to the |Dataset|.
Performing these actions returns a |DatasetView| into your |Dataset| that will
that will show only the samples and labels therein that match your criteria.

Overview
________

A |DatasetView| is returned whenever any sorting, slicing, or searching
operation is performed on a |Dataset|.

You can explicitly create a view that contains an entire dataset via
:meth:`Dataset.view() <fiftyone.core.dataset.Dataset.view>`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")

    view = dataset.view()

    print(view)

.. code-block:: text

    Dataset:        quickstart
    Media type:     image
    Num samples:    200
    Tags:           ['validation']
    Sample fields:
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
        uniqueness:   fiftyone.core.fields.FloatField
        predictions:  fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)
    View stages:
        ---

You can access specific information about a view in the natural ways:

.. code-block:: python
    :linenos:

    len(view)
    # 200

    view.media_type
    # "image"

.. note::

    |DatasetView| does not hold its contents in-memory; it contains a pipeline
    of operations that define what samples to will be loaded when the contents
    of the view are accessed.

Like datasets, you access the samples in a view by iterating over it:

.. code-block:: python
    :linenos:

    for sample in view:
        # Do something with `sample`

Or, you can access individual samples in a view by their ID or filepath:

.. code-block:: python
    :linenos:

    sample = view.take(1).first()

    print(type(sample))
    # fiftyone.core.sample.SampleView

    same_sample = view[sample.id]
    also_same_sample = view[sample.filepath]

    view[other_sample_id]
    # KeyError: sample non-existent or not in view

.. note::

    Accessing samples in a |DatasetView| returns |SampleView| objects, not
    |Sample| objects. The two classes are largely interchangable, but
    |SampleView| provides some extra features. See
    :ref:`filtering sample contents <filtering-sample-contents>` for more
    details.

View stages
___________

Dataset views encapsulate a pipeline of logical operations that determine which
samples appear in the view (and perhaps what subset of their contents).

Each view operation is captured by a |ViewStage|:

.. code-block:: python
    :linenos:

    # List available view operations on a dataset
    print(dataset.list_view_stages())
    # ['exclude', 'exclude_fields', 'exists', ..., 'skip', 'sort_by', 'take']

These operations are conveniently exposed as methods on |Dataset| instances,
in which case they create an initial |DatasetView|:

.. code-block:: python
    :linenos:

    # Random set of 100 samples from the dataset
    random_view = dataset.take(100)

    len(random_view)
    # 100

They are also exposed on |DatasetView| instances, in which case they return
another |DatasetView| with the operation appended to its internal pipeline so
that multiple operations can be chained together:

.. code-block:: python
    :linenos:

    # Sort `random_view` by filepath
    sorted_random_view = random_view.sort_by("filepath")

The sections below discuss some interesting view stages in more detail. You can
also refer to the :mod:`fiftyone.core.stages` module documentation for examples
of using each stage.

Sorting
_______

You can use
:meth:`sort_by() <fiftyone.core.collections.SampleCollection.sort_by>`
to sort the samples in a |Dataset| or |DatasetView| by a field of interest. The
samples in the returned |DatasetView| can be sorted in ascending or descending
order:

.. code-block:: python
    :linenos:

    view = dataset.sort_by("filepath")
    view = dataset.sort_by("filepath", reverse=True)

You can also sort by :ref:`expressions <querying-samples>`!

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Sort by number of detections in `Detections` field `ground_truth`
    view = dataset.sort_by(F("ground_truth.detections").length(), reverse=True)

    print(len(view.first().ground_truth.detections))  # 39
    print(len(view.last().ground_truth.detections))  # 0

Slicing
_______

You can extract a range of |Sample| instances from a |Dataset| using
:meth:`skip() <fiftyone.core.collections.SampleCollection.skip>` and
:meth:`limit() <fiftyone.core.collections.SampleCollection.limit>` or,
equivalently, by using array slicing:

.. code-block:: python
    :linenos:

    # Skip the first 2 samples and take the next 3
    range_view1 = dataset.skip(2).limit(3)

    # Equivalently, using array slicing
    range_view2 = dataset[2:5]

Samples can be accessed from views in
:ref:`all the same ways <accessing-samples-in-a-dataset>` as for datasets.
This includes using :meth:`first() <fiftyone.core.view.DatasetView.first>` and
:meth:`last() <fiftyone.core.view.DatasetView.last>` to retrieve the first and
last samples in a view, respectively, or accessing a sample directly from a
|DatasetView| by its ID or filepath.

.. note::

    Accessing a sample by its integer index in a |DatasetView| is not allowed.
    The best practice is to lookup individual samples by ID or filepath, or use
    array slicing to extract a range of samples, and iterate over samples in a
    view.

    .. code-block:: python

        view[0]
        # KeyError: "Accessing samples by numeric index is not supported.
        # Use sample IDs, filepaths, or slices"

Shuffling
_________

The samples in a |Dataset| or |DatasetView| can be randomly shuffled using
:meth:`shuffle() <fiftyone.core.collections.SampleCollection.shuffle>`:

.. code-block:: python
    :linenos:

    # Randomly shuffle the order of the samples in the dataset
    view1 = dataset.shuffle()

An optional ``seed`` can be provided to make the shuffle deterministic:

.. code-block:: python
    :linenos:

    # Randomly shuffle the samples in the dataset with a fixed seed

    view2 = dataset.shuffle(seed=51)
    print(view2.first().id)
    # 5f31bbfcd0d78c13abe159b1

    also_view2 = dataset.shuffle(seed=51)
    print(also_view2.first().id)
    # 5f31bbfcd0d78c13abe159b1

Random sampling
_______________

You can extract a random subset of the samples in a |Dataset| or |DatasetView|
using :meth:`take() <fiftyone.core.collections.SampleCollection.take>`:

.. code-block:: python
    :linenos:

    # Take 5 random samples from the dataset
    view1 = dataset.take(5)

An optional ``seed`` can be provided to make the sampling deterministic:

.. code-block:: python
    :linenos:

    # Take 5 random samples from the dataset with a fixed seed

    view2 = dataset.take(5, seed=51)
    print(view2.first().id)
    # 5f31bbfcd0d78c13abe159b1

    also_view2 = dataset.take(5, seed=51)
    print(also_view2.first().id)
    # 5f31bbfcd0d78c13abe159b1

Filtering
_________

The real power of |DatasetView| is the ability to write your own search queries
based on your data.

.. _querying-samples:

Querying samples
----------------

You can query for a subset of the samples in a dataset via the
:meth:`match() <fiftyone.core.collections.SampleCollection.match>` method. The
syntax is:

.. code-block:: python
    :linenos:

    match_view = dataset.match(expression)

where `expression` defines the matching expression to use to decide whether to
include a sample in the view.

FiftyOne provides powerful |ViewField| and |ViewExpression| classes that allow
you to use native Python operators to define your match expression. Simply wrap
the target field of your sample in a |ViewField| and then apply comparison,
logic, arithmetic or array operations to it to create a |ViewExpression|. You
can use `dot notation <https://docs.mongodb.com/manual/core/document/#dot-notation>`_
to refer to fields or subfields of the embedded documents in your samples.
Any resulting |ViewExpression| that returns a boolean is a valid expression!

The code below shows a few examples. See the API reference for |ViewExpression|
for a full list of supported operations.

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Populate metadata on all samples
    dataset.compute_metadata()

    # Samples whose image is less than 48 KB
    small_images_view = dataset.match(F("metadata.size_bytes") < 48 * 1024)

    # Samples that contain at least one prediction with confidence above 0.99
    # or whose label ifs "cat" or "dog"
    match = (F("confidence") > 0.99) | (F("label").is_in(("cat", "dog")))
    matching_view = dataset.match(
        F("predictions.detections").filter(match).length() > 0
    )

Common filters
--------------

Convenience functions for common queries are also available.

Use the
:meth:`match_tags() <fiftyone.core.collections.SampleCollection.match_tags>`
method to match samples that have the specified tag(s) in their `tags` field:

.. code-block:: python
    :linenos:

    # The validation split of the dataset
    val_view = dataset.match_tags("validation")

    # Union of the validation and test splits
    val_test_view = dataset.match_tags(("validation", "test"))

Use :meth:`exists() <fiftyone.core.collections.SampleCollection.exists>` to
only include samples for which a given |Field| exists and is not ``None``:

.. code-block:: python
    :linenos:

    # The subset of samples where predictions have been computed
    predictions_view = dataset.exists("predictions")

Use :meth:`select() <fiftyone.core.collections.SampleCollection.select>` and
:meth:`exclude() <fiftyone.core.collections.SampleCollection.exclude>` to
restrict attention to or exclude samples from a view by their IDs:

.. code-block:: python
    :linenos:

    # Get the IDs of two random samples
    sample_ids = [
        dataset.take(1).first().id,
        dataset.take(1).first().id,
    ]

    # Include only samples with the given IDs in the view
    selected_view = dataset.select(sample_ids)

    # Exclude samples with the given IDs from the view
    excluded_view = dataset.exclude(sample_ids)

.. _filtering-sample-contents:

Filtering sample contents
-------------------------

Dataset views can also be used to *filter the contents* of samples in the view.
That's why |DatasetView| instances return |SampleView| objects rather than
|Sample| objects.

|SampleView| instances represent the content of your samples in all of the
usual ways, with some important caveats:

- If you modify the contents of a |SampleView| and then
  :meth:`save() <fiftyone.core.sample.Sample.save>` it, any changes that
  you made to the contents of the |SampleView| will be reflected in the
  database.

- Sample views can exclude fields and filter elements of a field (e.g., omit
  certain detections from an array of detections in the sample). This means
  that |SampleView| instances need not contain all of the information in a
  sample.

- Sample views are not singletons and thus you must explicitly
  :meth:`reload() <fiftyone.core.sample.Sample.reload>` them in order to
  refresh their contents if the underlying sample has been modified elsewhere.
  However, extracting a |SampleView| from a |DatasetView| always returns the
  updated version of the sample's contents.

You can use the
:meth:`select_fields() <fiftyone.core.collections.SampleCollection.select_fields>`
and
:meth:`exclude_fields() <fiftyone.core.collections.SampleCollection.exclude_fields>`
stages to select or exclude fields from the returned |SampleView|:

.. code-block:: python
    :linenos:

    for sample in dataset.select_fields("ground_truth"):
        print(sample.id)            # OKAY: `id` is always available
        print(sample.ground_truth)  # OKAY: `ground_truth` was selected
        print(sample.predictions)   # AttributeError: `predictions` was not selected

    for sample in dataset.exclude_fields("predictions"):
        print(sample.id)            # OKAY: `id` is always available
        print(sample.ground_truth)  # OKAY: `ground_truth` was not excluded
        print(sample.predictions)   # AttributeError: `predictions` was excluded

The
:meth:`filter_labels() <fiftyone.core.collections.SampleCollection.filter_labels>`
stage is a powerful stage that allows you to filter the contents of
|Detections|, |Classifications|, |Polylines|, and |Keypoints| fields,
respectively.

Here are some self-contained examples for each task:

.. tabs::

    .. tab:: Classifications

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("imagenet-sample")

            # Only include samples whose ground truth `label` is "slug" or "conch"
            slug_conch_view = dataset.filter_labels(
                "ground_truth", (F("label") == "slug") | (F("label") == "conch")
            )

            session = fo.launch_app(view=slug_conch_view)

    .. tab:: Detections

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            # Bboxes are in [top-left-x, top-left-y, width, height] format
            bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

            # Only includes predictions whose bounding boxes have an area of at
            # least 50% of the image, and only include samples with at least
            # one prediction after filtering
            large_boxes_view = dataset.filter_labels("predictions", bbox_area >= 0.5)

            session = fo.launch_app(view=large_boxes_view)

    .. tab:: Polylines

        .. note::

            See the :ref:`BDD100K dataset <dataset-zoo-bdd100k>` in the Dataset
            Zoo for download instructions.

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.zoo as foz

            # The path to the source files that you manually downloaded
            source_dir = "/path/to/dir-with-bdd100k-files"

            dataset = foz.load_zoo_dataset(
                "bdd100k", split="validation", source_dir=source_dir
            )

            # Only include polylines that are filled (polygons, not polylines),
            # and only include samples with at least one polygon after filtering
            polygons_view = dataset.filter_labels("gt_polylines", F("filled") == True)

            session = fo.launch_app(view=polygons_view)

    .. tab:: Keypoints

        .. note::

            This example uses a
            :ref:`Keypoint R-CNN model <model-zoo-keypoint-rcnn-resnet50-fpn-coco-torch>`
            from the Model Zoo.

        .. code-block:: python
            :linenos:

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            # Load a keypoint model
            model = foz.load_zoo_model("keypoint-rcnn-resnet50-fpn-coco-torch")

            # Grab a few samples that have people in them
            person_view  = dataset.match(
                F("ground_truth.detections").map(F("label") == "person").length() > 0
            ).take(4)

            person_view.apply_model(model, label_field="rcnn")

            # Only include keypoints in the `rcnn_keypoints` field of each
            # sample that have at least 10 vertices, and only include samples
            # with at least one keypoint instance after filtering
            many_points_view = dataset.filter_labels(
                "rcnn_keypoints", F("points").length() >= 10,
            )

            session = fo.launch_app(view=many_points_view)

You can also use the
:meth:`filter_field() <fiftyone.core.collections.SampleCollection.filter_field>`
stage to filter the contents of arbitrarily-typed fields:

.. code-block:: python
    :linenos:

    # Remove tags from samples that don't include the "validation" tag
    clean_tags_view = dataset.filter_field("tags", F().contains("validation"))

.. note::

    When you create a |DatasetView| that contains filtered detections or
    classifications, the other labels are not removed from the source dataset,
    even if you :meth:`save() <fiftyone.core.sample.Sample.save>` a
    |SampleView| after modifying the filtered detections. This is becauase each
    label is updated individually, and other labels in the field are left
    unchanged.

    .. code-block:: python

        view = dataset.filter_labels("predictions", ...)

        for sample in view:
            predictions = sample.predictions

            # Modify the detections in the view
            for detection in predictions.detections:
                detection["new_field"] = True

            # Other detections in the `predictions` field of the samples that
            # did not appear in the `view` are not deleted or modified
            sample.save()

    If you *do want to delete data* from your samples, assign a new value to
    the field:

    .. code-block:: python

        view = dataset.filter_labels("predictions", ...)

        for sample in view:
            sample.predictions = fo.Detections(...)

            # Existing detections in the `predictions` field of the samples
            # are deleted
            sample.save()

.. _geolocation-views:

Geolocation
___________

If your samples have :ref:`geolocation data <geolocation>`, then you can
use the
:meth:`geo_near() <fiftyone.core.collections.SampleCollection.geo_near>` and
:meth:`geo_within() <fiftyone.core.collections.SampleCollection.geo_within>`
stages to filter your data based on their location.

For example, you can use
:meth:`geo_near() <fiftyone.core.collections.SampleCollection.geo_near>` to
sort your samples by proximity to a location:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    TIMES_SQUARE = [-73.9855, 40.7580]

    dataset = foz.load_zoo_dataset("quickstart-geo")

    # Sort the samples by their proximity to Times Square, and only include
    # samples within 5km
    view = dataset.geo_near(TIMES_SQUARE, max_distance=5000)

Or, you can use
:meth:`geo_within() <fiftyone.core.collections.SampleCollection.geo_within>` to
only include samples that lie within a longitude-latitude polygon of your
choice:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    MANHATTAN = [
        [
            [-73.949701, 40.834487],
            [-73.896611, 40.815076],
            [-73.998083, 40.696534],
            [-74.031751, 40.715273],
            [-73.949701, 40.834487],
        ]
    ]

    dataset = foz.load_zoo_dataset("quickstart-geo")

    # Only contains samples in Manhattan
    view = dataset.geo_within(MANHATTAN)

Modifying fields
________________

In certain situations, you may wish to temporarily modify the values of sample
fields in the context of a |DatasetView| without modifying the underlying
dataset. FiftyOne provides the
:meth:`set_field() <fiftyone.core.collections.SampleCollection.set_field>`
and
:meth:`map_labels() <fiftyone.core.collections.SampleCollection.map_labels>`
methods for this purpose.

For example, suppose you would like to rename a group of labels to a single
category in order to run your evaluation routine. You can use
:meth:`map_labels() <fiftyone.core.collections.SampleCollection.map_labels>`
to do this:

.. code-block:: python
    :linenos:

    ANIMALS = [
        "bear", "bird", "cat", "cow", "dog", "elephant", "giraffe",
        "horse", "sheep", "zebra"
    ]

    # Replace all animal detection's labels with "animal"
    mapping = {k: "animal" for k in ANIMALS}
    animals_view = dataset.map_labels("predictions", mapping)

    counts = animals_view.count_values("predictions.detections.label")
    print(counts["animal"])
    # 529

Or, suppose you would like to lower bound all confidences of objects in the
`predictions` field of a dataset. You can use
:meth:`set_field() <fiftyone.core.collections.SampleCollection.set_field>`
to do this:

.. code-block:: python
    :linenos:

    # Lower bound all confidences in the `predictions` field to 0.5
    bounded_view = dataset.set_field(
        "predictions.detections.confidence",
        F("confidence").max(0.5),
    )

    print(bounded_view.bounds("predictions.detections.confidence"))
    # (0.5, 0.9999035596847534)

The |ViewExpression| language is quite powerful, allowing you to define complex
operations without needing to write an explicit Python loop to perform the
desired manipulation.

For example, the snippet below visualizes the top-5 highest confidence
predictions for each sample in the
:ref:`quickstart dataset <dataset-zoo-quickstart>`:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Extracts the 5 highest confidence predictions for each sample
    top5_preds = F("detections").sort_by("confidence", reverse=True)[:5]

    top5_view = (
        dataset
        .set_field("predictions.detections", top5_preds)
        .select_fields("predictions")
    )

    session = fo.launch_app(view=top5_view)

Saving and cloning
__________________

Ordinarily, when you define a |DatasetView| that extracts a specific subset of
a dataset and its fields, the underlying |Dataset| is not modified. However,
you can use :meth:`save() <fiftyone.core.view.DatasetView.save>` to overwrite
the underlying dataset with the contents of a view you've created:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Discard all predictions with confidence below 0.3
    high_conf_view = dataset.filter_labels("predictions", F("confidence") > 0.3)
    high_conf_view.save()

Alternatively, you can create a new |Dataset| that contains only the contents
of a |DatasetView| using
:meth:`clone() <fiftyone.core.view.DatasetView.clone>`:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Create a new dataset that contains only the high confidence predictions
    high_conf_view = dataset.filter_labels("predictions", F("confidence") > 0.3)
    high_conf_dataset = high_conf_view.clone()

Tips & Tricks
_____________

Chaining view stages
--------------------

View stages can be chained together to perform complex operations:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Extract the first 5 samples with the "validation" tag, alphabetically by
    # filepath, whose images are >= 48 KB
    complex_view = (
        dataset
        .match_tags("validation")
        .exists("metadata")
        .match(F("metadata.size_bytes") >= 48 * 1024)  # >= 48 KB
        .sort_by("filepath")
        .limit(5)
    )

Filtering detections by area
----------------------------

Need to filter your detections by bounding box area? Use this |ViewExpression|!

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Bboxes are in [top-left-x, top-left-y, width, height] format
    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

    # Only contains boxes whose area is between 5% and 50% of the image
    medium_boxes_view = dataset.filter_labels(
        "predictions", (0.05 <= bbox_area) & (bbox_area < 0.5)
    )

FiftyOne stores bounding box coordinates as relative values in ``[0, 1]``.
However, you can use the expression below to filter by absolute pixel area:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    dataset.compute_metadata()

    # Computes the area of each bounding box in pixels
    bbox_area = (
        F("$metadata.width") * F("bounding_box")[2] *
        F("$metadata.height") * F("bounding_box")[3]
    )

    # Only contains boxes whose area is between 32^2 and 96^2 pixels
    medium_boxes_view = dataset.filter_labels(
        "predictions", (32 ** 2 < bbox_area) & (bbox_area < 96 ** 2)
    )

Removing a batch of samples from a dataset
------------------------------------------

You can easily remove a batch of samples from a |Dataset| by constructing a
|DatasetView| that contains the samples, and then deleting them from the
dataset as follows:

.. code-block:: python
    :linenos:

    # Choose 10 samples at random
    unlucky_samples = dataset.take(10)

    dataset.remove_samples(unlucky_samples)

Efficiently iterating samples
-----------------------------

If you have a dataset with larger fields, such as |Classifications| or
|Detections|, it can be expensive to load entire samples into memory. If, for a
particular use case, you are only interested in a
subset of fields, you can use
:class:`Dataset.select_fields() <fiftyone.core.dataset.Dataset.select_fields>`
to load only the fields of interest.

Let's say you have a dataset that looks like this:

.. code-block:: bash

    Name:           open-images-v4-test
    Num samples:    1000
    Persistent:     True
    Tags:           []
    Sample fields:
        filepath:                 StringField
        tags:                     ListField(StringField)
        metadata:                 EmbeddedDocumentField(Metadata)
        open_images_id:           StringField
        groundtruth_image_labels: EmbeddedDocumentField(Classifications)
        groundtruth_detections:   EmbeddedDocumentField(Detections)
        faster_rcnn:              EmbeddedDocumentField(Detections)
        mAP:                      FloatField
        AP_per_class:             DictField

and you want to get a list of ``open_images_id``'s for all samples in the
dataset. Loading other fields is unnecessary; in fact, using
:class:`Dataset.select_fields() <fiftyone.core.dataset.Dataset.select_fields>`
to load only the ``open_images_id`` field speeds up the operation below by
~200X!

.. code-block:: python
    :linenos:

    import time

    start = time.time()
    oiids = [s.open_images_id for s in dataset]
    print(time.time() - start)
    # 38.212332010269165

    start = time.time()
    oiids = [s.open_images_id for s in dataset.select_fields("open_images_id")]
    print(time.time() - start)
    # 0.20824909210205078
