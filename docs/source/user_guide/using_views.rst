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

Removing a batch of samples from a dataset
------------------------------------------

If you have a |DatasetView|, it can be used to modify the |Dataset|.
Every |Sample| in a given |DatasetView| can be removed from a |Dataset| with a
single command:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)


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

    view = dataset.view().sort_by("filepath")
    view = dataset.view().sort_by("id", reverse=True)


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
    range_view1 = view.skip(2).limit(3)

    # Equivalently, using array slicing
    range_view2 = view[2:5]


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
is :meth:`match() <fiftyone.core.view.DatasetView.match>`. This method takes a

ViewFields and Expressions
--------------------------

**TODO** WIP

Basic Querying
--------------

Convenience functions for common queries are available.

A |DatasetView| can be created by matching lists of |Sample| IDs, either to
only include given a |Sample| or to include all but the given |Sample|:

.. code-block:: python
    :linenos:

    sample_ids = [sample1.id, sample2.id]
    included = dataset.view().select(sample_ids)
    excluded = dataset.view().exclude(sample_ids)

A |DatasetView| can also be filtered to only include samples for which a
given |Field| exists and is not ``None``:

.. code-block:: python
    :linenos:

    metadata_view = dataset.view().exists("metadata")

Advanced Querying
-----------------

**TODO** This is a WIP

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

Filtering Sample Contents
-------------------------

**TODO** This is a WIP

|DatasetView| instances differ from |Dataset| instances in that they return
|SampleView| objects rather than |Sample| objects. For all intents and purposes
these behave the same with two important exceptions:
    - sample views can exclude fields and filter elements of a field, meaning
      they don't necessarily represent all of the information for a sample.
    - sample views are not singletons and thus can not be expected to stay
      updated if the backing document is modified elsewhere

To exclude fields...

