Dataset Views
=============

.. include:: ../substitutions.rst
.. default-role:: code

FiftyOne provides methods that allow you to sort, slice, and search your
|Dataset| using any information that you have added to the |Dataset|. When you
do so, you get a view (more specifically a |DatasetView|) into your |Dataset|
that will show only the samples and labels therein that match your criteria.


DatasetView Summary
___________________

A |DatasetView| is returned whenever any sorting, slicing, or searching
operation is performed on a |Dataset|. 
Unless sorted, a the samples in a |DatasetView| are returned in an
unpredictable order.
You can explicitly create a view that contains an entire dataset via
:meth:`Dataset.view() <fiftyone.core.dataset.Dataset.view>`:

.. code-block:: python
    :linenos:

    view = dataset.view()

    print(len(view))
    # 2

    print(view)

.. code-block:: text

    Dataset:        interesting_dataset
    Num samples:    2
    Tags:           ['test', 'train']
    Sample fields:
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    Pipeline stages:
        ---


Adding Stages to DatasetViews
-----------------------------

Dataset views encapsulate a pipeline of logical operations that determine which
samples appear in the view (and perhaps what subset of their contents).

Each view operation is captured by a |ViewStage|, and these operations are
conveniently exposed as methods on both |Dataset|, in which case they create an
initial |DatasetView|, and on |DatasetView|, in which case they return another
|DatasetView| with the operation appended to its internal pipeline so that
multiple operations can be chained together.

.. code-block:: python
    :linenos:

    print(fo.Dataset.list_view_stages())
    # ['exclude', 'exclude_fields', 'exists', ..., 'skip', 'sort_by', 'take']

The sections below discuss each view stage operation in more detail.


Sorting
_______

Sorting samples is the simplest operation that can be performed on a |Dataset|.
By default, a |Dataset| is unordered, however, the 
:meth:`sort_by() <fiftyone.core.view.DatasetView.sort_by>` method can be used
to sort a |Dataset| or |DatasetView| and this always returns a new
|DatasetView|. 
The samples in the returned |DatasetView| can be sorted (forward or in reverse)
by any |Field|:

.. code-block:: python
    :linenos:

    view = dataset.sort_by("filepath")
    view = dataset.sort_by("id", reverse=True)


Slicing
_______

Accessing sample ranges
-----------------------

You can extract a range of |Sample| instances from a |Dataset| using
:meth:`skip() <fiftyone.core.view.DatasetView.skip>` and
:meth:`limit() <fiftyone.core.view.DatasetView.limit>` or, equivalently,
by using array slicing:

.. code-block:: python
    :linenos:

    # Skip the first 2 samples and take the next 3
    range_view1 = dataset.skip(2).limit(3)

    # Equivalently, using array slicing
    range_view2 = dataset[2:5]


Accessing single samples
------------------------

Samples can be accessed from views in
:ref:`all the same ways as for datasets <accessing-samples-in-a-dataset>`.
This includes using :meth:`first() <fiftyone.core.dataset.Dataset.first>` and
:meth:`last() <fiftyone.core.dataset.Dataset.last>` to retrieve the first and
last samples in a dataset, respectively, or accessing a |Sample| directly from 
a |DatasetView| by its ID.


.. note::

    Note that accessing a sample by its integer index in a |DatasetView| is
    not allowed, as this conflicts with access by ID.

    The best practice is to lookup individual samples by ID, or use array
    slicing to extract a range of samples, and iterate over samples in a view.

    .. code-block:: python

        view[0]
        # KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"


Filtering
_________

The real power behind a |DatasetView| is the ability to write your own search
query based off of any aspect of your data.

Querying Samples
----------------

To query for a subset of the samples in a dataset, the core stage to work with
is :meth:`match() <fiftyone.core.view.DatasetView.match>`.

.. code-block:: python
    :linenos:

    match_view = dataset.match(<expression>)

This method expects a query expression ``dict`` in
`MongoDB query format <https://docs.mongodb.com/manual/tutorial/query-documents/>`_.
If you don't feel like learning all of that, FiftyOne conveniently provides a
|ViewExpression| class that allows you to use python native operators. More
details on that can be found :ref:`here <Query Expressions>`.

Convenience functions for common queries are also available.

:meth:`match_tag() <fiftyone.core.view.DatasetView.match_tag>` and
:meth:`match_tags() <fiftyone.core.view.DatasetView.match_tags>` are
convenience functions for matching samples that have the specified ``tag``
or one of the specified ``tags``:

.. code-block:: python
    :linenos:

    # the training split of the dataset
    train_view = dataset.match_tag("train")

    # union of the validation and test splits
    val_test_view = dataset.match_tags(["val", "test"])

:meth:`exists() <fiftyone.core.view.DatasetView.exists>` filters to only
include samples for which a given |Field| exists and is not ``None``:

.. code-block:: python
    :linenos:

    # the subset of samples where predictions have been computed
    predictions_view = dataset.exists("my_predictions")

:meth:`select() <fiftyone.core.view.DatasetView.select>` and
:meth:`exclude() <fiftyone.core.view.DatasetView.exclude>` take a list of
|Sample| IDs and restrict to the matching samples or exclude the matching
samples respectively:

.. code-block:: python
    :linenos:

    sample_ids = [sample1.id, sample2.id]
    included_view = dataset.select(sample_ids)
    excluded_view = dataset.exclude(sample_ids)


Query Expressions
-----------------

The :meth:`match() <fiftyone.core.view.DatasetView.match>` stage can accept
arbitrarily complex queries. But you want to be spending your time digging into
the data, not the MongoDB documentation. FiftyOne provides the |ViewField|
and |ViewExpression| classes for this.

Simply wrap the target field in a |ViewField| and then apply comparison, logic,
arithmetic or array operations to it to create a |ViewExpression|. Just be sure
that the final expression returns a boolean!

Below are a few examples. Check the API reference for |ViewExpression| for
a full list of supported operators.

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    # samples whose size is less than 1024 bytes
    small_files_view = dataset.match(F("metadata.size_bytes") < 1024)

    # samples for which `my_classification` is either confident or
    # the label is "cat" or "dog"
    classification_filtering_view = dataset.match(
        (F("my_classification.confidence") >= 0.5)
        | F("my_classification.label").is_in(["hex", "tricam"])
    )


Filtering Sample Contents
-------------------------

Dataset views can not only select **what samples** but also **what content**
for each sample.

|DatasetView| instances return |SampleView| objects rather than |Sample|
objects. For all intents and purposes these behave the same with two important
exceptions:
    - sample views can exclude fields and filter elements of a field, meaning
      they don't necessarily represent all of the information for a sample.
    - sample views are not singletons and thus can not be expected to stay
      updated if the backing document is modified elsewhere

The :meth:`select_fields() <fiftyone.core.view.DatasetView.select_fields>` and
:meth:`exclude_fields() <fiftyone.core.view.DatasetView.exclude_fields>`
stages can sub -select or -exclude fields from the returned |SampleView|.

.. code-block:: python
    :linenos:

    for sample in dataset.select_fields(["tags"]):
        print(sample.tags)     # OKAY: this field is selected and thus accessible
        print(sample.id)       # OKAY: the ID is always available
        print(sample.filepath) # NameError: Field 'filepath' is not selected in this SampleView

    for sample in dataset.exclude_fields(["tags"]):
        print(sample.id)       # OKAY: the ID is always available
        print(sample.filepath) # OKAY: filepath is not excluded
        print(sample.tags)     # NameError: Field 'tags' is excluded from this SampleView
    )


:meth:`filter_classifications() <fiftyone.core.view.DatasetView.filter_classifications>`
and :meth:`filter_detections() <fiftyone.core.view.DatasetView.filter_detections>`
stages are very powerful when working with |Classifications| or |Detections|
fields respectively. These stages filter the list of |Classification| or
|Detection| in a field.

.. code-block:: python
    :linenos:

    # filter the `my_classifications` field of each sample to only confident
    # predictions with the label 'friend'
    confident_friends_view = dataset.filter_classifications(
        "my_classifications", (F("confidence") > 0.5) & (F("label") == "friend")
    )

    # filter the `my_detections` field of each sample to only large boxes
    large_boxes_view = dataset.filter_detections(
        "my_detections", F("bounding_box")[2] * F("bounding_box")[3] >= 0.5
    )

Tips & Tricks
_____________

Chaining view stages
--------------------

All of the aformentioned view stages can be chained together:

.. code-block:: python
    :linenos:

    complex_view = (
        dataset.match_tag("test")
        .exists("metadata")
        .sort_by("filepath")
        .limit(5)
    )

Bounding Box Area
-----------------

Need to filter your detections by bounding box area?! Use this expression!

.. code-block:: python
    :linenos:

    # bounding box area expression (W x H)
    bbox_area = F("bounding_box")[2] * F("bounding_box")[3]

    # example usage
    medium_boxes_view = dataset.filter_detections(
        "my_detections", (0.05 <= bbox_area) & (bbox_area < 0.5)
    )


Removing a batch of samples from a dataset
------------------------------------------

If you have a |DatasetView|, it can be used to modify the |Dataset|.
Every |Sample| in a given |DatasetView| can be removed from a |Dataset| with a
single command:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)
