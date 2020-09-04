Dataset Views
=============

.. default-role:: code

FiftyOne provides methods that allow you to sort, slice, and search your
|Dataset| using any information that you have added to the |Dataset|.
Performing these actions returns a |DatasetView| into your |Dataset| that will
that will show only the samples and labels therein that match your criteria.

.. _using-views:

Overview
________

A |DatasetView| is returned whenever any sorting, slicing, or searching
operation is performed on a |Dataset|.

You can explicitly create a view that contains an entire dataset via
:meth:`Dataset.view() <fiftyone.core.dataset.Dataset.view>`:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("cifar10", split="test")

    view = dataset.view()

    print(view)

.. code-block:: text

    Dataset:        cifar10-test
    Num samples:    10000
    Persistent:     False
    Info:           {'classes': ['airplane', 'automobile', 'bird', ...]}
    Tags:           ['test']
    Sample fields:
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Classification)
    Pipeline stages:
        ---

You can access specific information about a view in the natural ways:

.. code-block:: python
    :linenos:

    len(view)
    # 10000

    view.get_tags()
    # ['test']

.. note::

    |DatasetView| does not hold its contents in-memory; it contains a pipeline
    of operations that define what samples to will be loaded when the contents
    of the view are accessed.

Like datasets, you access the samples in a view by iterating over it:

.. code-block:: python
    :linenos:

    for sample in view:
        # Do something with `sample`

Or, you can access individual samples in a view by their ID:

.. code-block:: python
    :linenos:

    sample = view[sample_id]

    view[other_sample_id]
    # KeyError: if the specified sample is not in the view

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

These operations are conveniently exposed as methods on both |Dataset|, in
which case they create an initial |DatasetView|:

.. code-block:: python
    :linenos:

    # Random set of 100 samples from the dataset
    random_view = dataset.take(100)

    len(random_view)
    # 100

They are also exposed on |DatasetView|, in which case they return another
|DatasetView| with the operation appended to its internal pipeline so that
multiple operations can be chained together.

.. code-block:: python
    :linenos:

    # Sort `random_view` by filepath
    sorted_random_view = random_view.sort_by("filepath")

The sections below discuss each view stage in more detail.

Sorting
_______

You can use :meth:`sort_by() <fiftyone.core.view.DatasetView.sort_by>` to sort
the samples in a |Dataset| or |DatasetView| by a field of interest. The samples
in the returned |DatasetView| can be sorted in ascending or descending order:

.. code-block:: python
    :linenos:

    view = dataset.sort_by("filepath")
    view = dataset.sort_by("id", reverse=True)

You can also sort by :ref:`expressions <querying-samples>`!

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # Sort by number of detections in `Detections` field `ground_truth`
    view = dataset.sort_by(F("ground_truth.detections").length(), reverse=True)

Shuffling
_________

The samples in a |Dataset| or |DatasetView| can be randomly shuffled using
:meth:`shuffle() <fiftyone.core.view.DatasetView.shuffle>`:

.. code-block:: python
    :linenos:

    # Randomly shuffle the order of the samples in the dataset
    view1 = dataset.shuffle()

    print(view1.first().id)
    # 5f31bbfcd0d78c13abe159af

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

Slicing
_______

You can extract a range of |Sample| instances from a |Dataset| using
:meth:`skip() <fiftyone.core.view.DatasetView.skip>` and
:meth:`limit() <fiftyone.core.view.DatasetView.limit>` or, equivalently, by
using array slicing:

.. code-block:: python
    :linenos:

    # Skip the first 2 samples and take the next 3
    range_view1 = dataset.skip(2).limit(3)

    # Equivalently, using array slicing
    range_view2 = dataset[2:5]

Samples can be accessed from views in
:ref:`all the same ways as for datasets <accessing-samples-in-a-dataset>`.
This includes using :meth:`first() <fiftyone.core.dataset.Dataset.first>` and
:meth:`last() <fiftyone.core.dataset.Dataset.last>` to retrieve the first and
last samples in a dataset, respectively, or accessing a |Sample| directly from
a |DatasetView| by its ID.

.. note::

    Accessing a sample by its integer index in a |DatasetView| is not allowed.
    The best practice is to lookup individual samples by ID, or use array
    slicing to extract a range of samples, and iterate over samples in a view.

    .. code-block:: python

        view[0]
        # KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"

Random sampling
_______________

You can extract a random subset of the samples in a |Dataset| or |DatasetView|
using :meth:`take() <fiftyone.core.view.DatasetView.take>`:

.. code-block:: python
    :linenos:

    # Take 5 random samples from the dataset
    view1 = dataset.take(5)
    print(view1.first().id)
    # 5f31bbfcd0d78c13abe159af

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
:meth:`match() <fiftyone.core.view.DatasetView.match>` method. The syntax is:

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

    # Samples whose size is less than 1024 bytes
    small_files_view = dataset.match(F("metadata.size_bytes") < 1024)

    # Samples for which `my_classification` is either confident or
    # the label is "cat" or "dog"
    classification_filtering_view = dataset.match(
        (F("my_classification.confidence") >= 0.5)
        | F("my_classification.label").is_in(["hex", "tricam"])
    )

Alternatively, for ultimate flexibility, you can specify your match expression
as a Python dict defining an arbitrary
`MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_.

Common filters
--------------

Convenience functions for common queries are also available.

Use the :meth:`match_tag() <fiftyone.core.view.DatasetView.match_tag>` and
:meth:`match_tags() <fiftyone.core.view.DatasetView.match_tags>` methods to
match samples that the specified tag(s) in their `tags` field:

.. code-block:: python
    :linenos:

    # The training split of the dataset
    train_view = dataset.match_tag("train")

    # Union of the validation and test splits
    val_test_view = dataset.match_tags(["val", "test"])

Use :meth:`exists() <fiftyone.core.view.DatasetView.exists>` to only include
samples for which a given |Field| exists and is not ``None``:

.. code-block:: python
    :linenos:

    # The subset of samples where predictions have been computed
    predictions_view = dataset.exists("my_predictions")

Use :meth:`select() <fiftyone.core.view.DatasetView.select>` and
:meth:`exclude() <fiftyone.core.view.DatasetView.exclude>` to restriction
attention to or exclude samples from a view by their IDs:

.. code-block:: python
    :linenos:

    sample_ids = [sample1.id, sample2.id]

    # Include only samples with the given IDs in the view
    included_view = dataset.select(sample_ids)

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
:meth:`select_fields() <fiftyone.core.view.DatasetView.select_fields>` and
:meth:`exclude_fields() <fiftyone.core.view.DatasetView.exclude_fields>`
stages to select or exclude fields from the returned |SampleView|:

.. code-block:: python
    :linenos:

    for sample in dataset.select_fields(["tags"]):
        print(sample.tags)     # OKAY: `tags` was selected and thus available
        print(sample.id)       # OKAY: `id` is always available
        print(sample.filepath) # AttributeError: `filepath` was not selected

    for sample in dataset.exclude_fields(["tags"]):
        print(sample.id)       # OKAY: `id` is always available
        print(sample.filepath) # OKAY: `filepath` is not excluded
        print(sample.tags)     # AttributeError: `tags` was excluded
    )

The :meth:`filter_classifications() <fiftyone.core.view.DatasetView.filter_classifications>`
and :meth:`filter_detections() <fiftyone.core.view.DatasetView.filter_detections>`
stages are powerful stages that allow you to filter the contents of
|Classifications| and |Detections| fields, respectively.

Here are some examples:

.. code-block:: python
    :linenos:

    # Only include labels in the `my_classifications` field of each sample with
    # label "friend" and confidence greater than 0.5
    confident_friends_view = dataset.filter_classifications(
        "my_classifications", (F("confidence") > 0.5) & (F("label") == "friend")
    )

    # Only include detections in the `my_detections` field whose boxes have
    # an area of at least 0.5
    large_boxes_view = dataset.filter_detections(
        "my_detections", F("bounding_box")[2] * F("bounding_box")[3] >= 0.5
    )

.. note::

    When you create a |DatasetView| that contains filtered detections or
    classifications, the other labels are not removed from the source dataset,
    even if you :meth:`save() <fiftyone.core.sample.Sample.save>` a
    |SampleView| after modifying the filtered detections. This is becauase each
    label is updated individually, and other labels in the field are left
    unchanged.

    .. code-block:: python

        view = dataset.filter_detections("predictions", ...)

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

        view = dataset.filter_detections("predictions", ...)

        for sample in view:
            sample.predictions = fo.Detections(...)

            # Existing detections in the `predictions` field of the samples
            # are deleted
            sample.save()

Tips & Tricks
_____________

Chaining view stages
--------------------

View stages can be chained together to perform arbitrarily complex operations:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    complex_view = (
        dataset.match_tag("test")
        .exists("metadata")
        .match(F("metadata.size_bytes") >= 64 * 1024)  # >= 64 kB
        .sort_by("filepath")
        .limit(5)
    )

Filtering detections by area
----------------------------

Need to filter your detections by bounding box area? Use this expression!

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # bbox format is [top-left-x, top-left-y, width, height]
    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

    medium_boxes_view = dataset.filter_detections(
        "my_detections", (0.05 <= bbox_area) & (bbox_area < 0.5)
    )

Removing a batch of samples from a dataset
------------------------------------------

You can easily remove a batch of samples from a |Dataset| by constructing a
|DatasetView| that contains the samples, and then deleting them from the
dataset as follows:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)

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
    Info:           {}
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
