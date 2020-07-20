Using FiftyOne Datasets
=======================

.. include:: ../substitutions.rst
.. default-role:: code

After a |WhatIsAFiftyOneDataset| has been loaded or created, FiftyOne provides
powerful functionality to inspect, search, and modify it from a |Dataset|-wide
down to a |Sample| level.

The following sections provide details of how to use various aspects of a
FiftyOne |Dataset|.

.. _using-datasets:

Datasets
________

Instantiating a |Dataset| creates a **new** dataset.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset1 = fo.Dataset(name="my_first_dataset")
    dataset2 = fo.Dataset(name="my_second_dataset")
    dataset3 = fo.Dataset(name="my_third_dataset")

Check to see what datasets exist at any time via :meth:`list_dataset_names()
<fiftyone.core.dataset.list_dataset_names>`.

.. code-block:: python
    :linenos:

    print(fo.list_dataset_names())
    # ['my_first_dataset', 'my_second_dataset', 'my_third_dataset']

Load a dataset using :meth:`load_dataset() <fiftyone.core.dataset.load_dataset>`.
Dataset objects are singletons. Cool!

.. code-block:: python
    :linenos:

    dataset2_reference = fo.load_dataset("my_second_dataset")
    dataset2_reference is dataset2  # True

If you try to *load* a dataset via `Dataset(...)` or *create* a dataset via
:meth:`load_dataset() <fiftyone.core.dataset.load_dataset>` you're going to
have a bad time.

.. code-block:: python
    :linenos:

    dataset3_reference = fo.Dataset(name="my_third_dataset")
    # Dataset 'my_third_dataset' already exists; use `fiftyone.load_dataset()` to load an existing dataset

    dataset4 = fo.load_dataset(name="my_fourth_dataset")
    # fiftyone.core.dataset.DoesNotExistError: Dataset 'my_fourth_dataset' not found

Dataset Persistence
-------------------

By default, datasets are non-persistent. Non-persistent datasets are wiped
from FiftyOne on exit of the python process. This means any data in the
FiftyOne backing database is deleted, however files on disk are untouched.

To make a dataset persistent, set the attribute to `True`.

.. code-block:: python
    :linenos:

    dataset1.persistent = True
    quit()

Start a new python session:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    print(fo.list_dataset_names())
    # ['my_first_dataset']

Note that `my_second_dataset` and `my_third_dataset` have been wiped because
they were not persistent.

Deleting a Dataset
------------------

Delete a dataset explicitly via
:meth:`Dataset.delete() <fiftyone.core.dataset.Dataset.delete>`. Once a dataset
is deleted, any existing reference in memory will be in a volatile state.
:class:`Dataset.name <fiftyone.core.dataset.Dataset>` and
:class:`Dataset.deleted <fiftyone.core.dataset.Dataset>` will still be valid
attributes, but calling any other attribute or method will raise a
`DoesNotExistError`.

.. code-block:: python
    :linenos:

    dataset = fo.load_dataset("my_first_dataset")
    dataset.delete()

    print(fo.list_dataset_names())
    # []

    print(dataset.name)
    # my_first_dataset

    print(dataset.deleted)
    # True

    print(dataset.persistent)
    # fiftyone.core.dataset.DoesNotExistError: Dataset 'my_first_dataset' is deleted

.. _using-samples:

Samples
_______

An individual |Sample| is always initialized with a file path to the
corresponding image on disk. The image is not read at this point:

.. code-block:: python
    :linenos:

    sample = fo.Sample(filepath="path/to/image.png")

Adding Samples to a Dataset
---------------------------

A |Sample| can easily be added to an existing |Dataset|:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset(name="example_dataset")
    dataset.add_sample(sample)

When a |Sample| is added to a |Dataset|, the related attributes of the |Sample|
are automatically updated:

.. code-block:: python
    :linenos:

    print(sample.in_dataset)
    # True

    print(sample.dataset_name)
    # example_dataset

Every |Sample| in a |Dataset| is given a unique ID when it is added:

.. code-block:: python
    :linenos:

    print(sample.id)
    # 5ee0ebd72ceafe13e7741c42

A batch of multiple |Sample| objects can be added to a |Dataset| at the same
time by providing a list of samples:

.. code-block:: python
    :linenos:

    print(len(dataset))
    # 1

    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/img1.jpg"),
            fo.Sample(filepath="/path/to/img2.jpg"),
            fo.Sample(filepath="/path/to/img3.jpg"),
        ]
    )

    print(len(dataset))
    # 4

Accessing samples in a Dataset
------------------------------

FiftyOne provides multiple ways to access a |Sample| in a |Dataset|.

A |Dataset| is iterable allowing every |Sample| to be accessed one at a time:

.. code-block:: python
    :linenos:

    for sample in dataset:
        print(sample)

A |Sample| can be accessed directly from a |Dataset| by its ID. The |Sample|
that is returned when accessing a |Dataset| will always provide the same
instance:

.. code-block:: python
    :linenos:

    same_sample = dataset[sample.id]

    print(same_sample is sample)
    # True

More ways of accessing samples are provided through a |DatasetView| described
below.

Removing samples from a Dataset
-------------------------------

Samples can be removed from a |Dataset| through their ID, either one at a
time or in a batch:

.. code-block:: python
    :linenos:

    del dataset[sample_id]

    dataset.remove_samples([sample_id2, sample_id3])

Samples can also be removed from a |Dataset| by using the sample's ID or the
|Sample| instance:

.. code-block:: python
    :linenos:

    dataset.remove_sample(sample_id)

    # or equivalently:
    sample = dataset[sample_id]
    dataset.remove_sample(sample)

In the latter case, where the |Sample| is in memory, it will behave the same as
a |Sample| that has never been added to the |Dataset|:

.. code-block:: python
    :linenos:

    print(sample.in_dataset)
    # False

    print(sample.dataset_name)
    # None

    print(sample.id)
    # None

.. _using-fields:

Fields
______

A |Field| is an attribute of a |Sample| that is shared across all samples in a
|Dataset|.

By default, a |Dataset| and the samples therein have fields
`filepath`, `metadata`, and `tags`. `filepath` is a required parameter.

Accessing fields of a Sample
----------------------------

The names of available fields can be checked on any individual |Sample|:

.. code-block:: python
    :linenos:

    sample.field_names
    # ('filepath', 'tags', 'metadata')

Only the |Dataset| has any notion of a field "schema", which specifies the
field types:

.. code-block:: python
    :linenos:

    dataset.get_field_schema()
    # OrderedDict(
    #     [
    #         ('filepath', <fiftyone.core.fields.StringField object at 0x11436e710>),
    #         ('tags',     <fiftyone.core.fields.ListField object at 0x11b7f2dd8>),
    #         ('metadata', <fiftyone.core.fields.EmbeddedDocumentField object at 0x11b7f2e80>)
    #     ]
    # )

To to simply view the field schema print the dataset:

.. code-block:: python
    :linenos:

    print(dataset)
    # Name:           a_dataset
    # Persistent:     False
    # Num samples:    0
    # Tags:           []
    # Sample fields:
    #     filepath: fiftyone.core.fields.StringField
    #     tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    #     metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

The value of a |Field| for a given |Sample| can be accessed either by key or
attribute access:

.. code-block:: python
    :linenos:

    sample.filepath
    sample["filepath"]

Adding fields to a Sample
-------------------------

New fields can be added to a |Sample| using key assignment:

.. code-block:: python
    :linenos:

    sample["integer_field"] = 51
    sample.save()

If this |Sample| is in a |Dataset| the field schema will be automatically
updated:

.. code-block:: python
    :linenos:

    print(dataset)
    # Name:           a_dataset
    # Persistent:     False
    # Num samples:    0
    # Tags:           []
    # Sample fields:
    #     filepath:      fiftyone.core.fields.StringField
    #     tags:          fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    #     metadata:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    #     integer_field: fiftyone.core.fields.IntField

A |Field| can be any primitive type: `bool`, `int`, `float`, `str`, `list`,
`dict`, or more complex data structures like |Label|:

.. code-block:: python
    :linenos:

    sample["ground_truth"] = fo.Classification(label="alligator")
    sample.save()

Whenever a new |Field| is added to one |Sample| in a |Dataset|, that |Field| is
added to every other |Sample| in the |Dataset| with the value `None`.

A |Field| must be the same type across every |Sample| in the |Dataset|. Setting
a |Field| to an inappropriate type raises a `ValidationError`:

.. code-block:: python
    :linenos:

    sample2.integer_field = "a string"
    sample2.save()
    # ValidationError: a string could not be converted to int

.. note::

    If the |Sample| is in a |Dataset|, then
    :meth:`sample.save() <fiftyone.core.sample.Sample.save>` must be used
    whenever the |Sample| is updated.

Removing fields from a Sample
-----------------------------

A |Field| can be deleted from a |Sample| using `del`:

.. code-block:: python
    :linenos:

    del sample["integer_field"]
    print(sample.integer_field)
    # None

A |Field| can be removed from a |Dataset|, in which case it is deleted for
every |Sample| in the |Dataset|:

.. code-block:: python
    :linenos:

    dataset.delete_sample_field("integer_field")
    sample.integer_field
    # AttributeError: Sample has no field 'integer_field'

.. _using-tags:

Tags
----

`Sample.tags` is a special :class:`ListField <fiftyone.core.fields.ListField>`
that every |Sample| has by default. `tags` is just a list of strings, provided
for convenience. For example, tags can be used to define dataset splits or mark
low quality images:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset("tagged_dataset")

    dataset.add_samples(
        [
            fo.Sample(filepath="path/to/img1.png", tags=["train"]),
            fo.Sample(filepath="path/to/img2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.get_tags())
    # {"test", "low_quality", "train"}

`Sample.tags` can be treated like a standard python `list`:

.. code-block:: python
    :linenos:

    sample.tags += ["new_tag"]
    sample.save()

.. note::

    If the |Sample| is in a |Dataset|, then `sample.save()` must be used
    whenever the |Sample| is updated.

.. _using-dataset-views:

DatasetViews
____________

FiftyOne provides a powerful and flexible class, |DatasetView|, for accessing
subsets of samples.
The default view of a |Dataset| encompasses the entire |Dataset|, with
unpredictable sort order.
Basic ways to explore a |DatasetView| are available:

.. code-block:: python
    :linenos:

    print(len(dataset.view()))
    # 2

    print(dataset.view())
    # Dataset:        interesting_dataset
    # Num samples:    2
    # Tags:           ['test', 'train']
    # Sample fields:
    #     filepath: fiftyone.core.fields.StringField
    #     tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
    #     metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

Accessing Samples in DatasetViews
---------------------------------

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

    # equivalently
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

Sorting
-------

The samples in a |DatasetView| can be sorted (forward or in reverse) by any
|Field|:

.. code-block:: python
    :linenos:

    view = dataset.view().sort_by("filepath")
    view = dataset.view().sort_by("id", reverse=True)

Querying
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

Chaining view stages
--------------------

All of the aformentioned view stages can be chained together:

.. code-block:: python
    :linenos:

    complex_view = (
        dataset.view()
        .match({"tags": "test"})
        .exists("metadata")
        .sort_by("filepath")
        .limit(5)
    )

Removing a batch of samples from a Dataset
------------------------------------------

Every |Sample| in a given |DatasetView| can be removed from a |Dataset| with a
single command:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)
