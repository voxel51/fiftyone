Sorting, Slicing, and Searching Datasets
========================================

.. include:: ../substitutions.rst
.. default-role:: code

FiftyOne provides methods that allow you to sort, slice, and search your
|Dataset| along any information that you have added to the |Dataset|. When you
do so, you get a view (more specifically a |DatasetView|) into your |Dataset| that will show only the
samples and labels therein that match your criteria.


DatasetView Summary
___________________

A |DatasetView| is returned whenever any sorting, slicing, or searching
operation is performed on a |Dataset|. 
Unless sorted, a the samples in a |DatasetView| are returned in an
unpredictable order.
Basic ways to explore a |DatasetView| are available:

.. code-block:: python
    :linenos:

    print(len(dataset.view()))
    # 2

    print(dataset.view())

.. code-block:: text

    Dataset:        interesting_dataset
    Num samples:    2
    Tags:           ['test', 'train']
    Sample fields:
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

Chaining view stages
--------------------

All view operations that are covered below can be chained together:

.. code-block:: python
    :linenos:

    complex_view = (
        dataset.view()
        .match({"tags": "test"})
        .exists("metadata")
        .sort_by("filepath")
        .limit(5)
    )

Removing a batch of samples from a dataset
------------------------------------------

If you have a |DatasetView|, it can be used to modify the |Dataset|.
Every |Sample| in a given |DatasetView| can be removed from a |Dataset| with a
single command:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)


Sorting
_______

Sorting samples is the simplest operation that can be performed on a |Dataset|.
By default, a |Dataset| is unordered, however, the 
:meth:`sort_by() <fiftyone.core.view.DatasetView.sort_by>` method can be used
to sort a |Dataset| or |DatasetView|. 
Sorting a |Dataset| returns a |DatasetView|.
The samples in the returned |DatasetView| can be sorted (forward or in reverse)
by any |Field|:

.. code-block:: python
    :linenos:

    view = dataset.view().sort_by("filepath")
    view = dataset.view().sort_by("id", reverse=True)


Slicing
_______

Accessing Sample ranges
-----------------------

Use :meth:`DatasetView.first() <fiftyone.core.view.DatasetView.first()>` to get
the first sample in a |DatasetView| or
:meth:`DatasetView.take(x) <fiftyone.core.view.DatasetView.take>` to get a new
|DatasetView| containing `x` random |Sample| objects:

.. code-block:: python
    :linenos:

    first_sample = dataset.view().first()

    new_view = dataset.view().take(2)

    print(len(new_view))
    # 2

Ranges of |Sample| objects can be accessed using
:meth:`skip() <fiftyone.core.view.DatasetView.skip>` and
:meth:`limit() <fiftyone.core.view.DatasetView.limit>` or equivalently through
array slicing:

.. code-block:: python
    :linenos:

    # Skip the first 2 samples and take the next 3
    view = dataset.view()

    view.skip(2).limit(3)

    # Equivalently
    view[2:5]

Note that accessing an individual sample by its integer index in the view is
not supported (this is not an efficient operation with FiftyOne datasets):

.. code-block:: python
    :linenos:

    view[0]
    # KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"

As with a |Dataset|, a |Sample| in a |DatasetView| can be accessed by ID and
a |DatasetView| is iterable:

.. code-block:: python
    :linenos:

    sample = view[sample.id]

    for sample in view:
        print(sample)

Accessing single samples
------------------------


Searching
_________


ViewFields and Expressions
--------------------------

Matching
--------

A |DatasetView| can be queried using :meth:`match()
<fiftyone.core.view.DatasetView.match>`. The syntax follows
`MongoDB queries <https://docs.mongodb.com/manual/tutorial/query-documents/>`_:

.. code-block:: python
    :linenos:

    # Get only samples with the tag "train"
    view = dataset.view().match({"tags": "train"})

Convenience functions for common queries are also available.

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

Filtering
---------


