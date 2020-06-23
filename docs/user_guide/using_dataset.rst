Using FiftyOne Datasets
=======================

.. default-role:: code

After a `Dataset` has been loaded or created, FiftyOne provides powerful
functionality to inspect, search, and modify it from a `Dataset`-wide down to a
`Sample` level.

The following sections provide details of how to use various aspects of
FiftyOne `Datasets`.

Datasets
________

Instantiating a `Dataset` creates a **new** dataset.

.. code-block:: python

    import fiftyone as fo

    dataset1 = fo.Dataset(name="my_first_dataset")
    dataset2 = fo.Dataset(name="my_second_dataset")
    dataset3 = fo.Dataset(name="my_third_dataset")

Check to see what datasets exist at any time via `list_dataset_names()`.

.. code-block:: python

    print(fo.list_dataset_names())

.. code-block:: plain

    ['my_first_dataset', 'my_second_dataset', 'my_third_dataset']

Load a dataset using `load_dataset()`. Dataset objects are singletons. Cool!

.. code-block:: python

    dataset2_reference = fo.load_dataset("my_second_dataset")
    print(dataset2_reference is dataset2)

.. code-block:: plain

    True

If you try to *load* a dataset via `Dataset(...)` or *create* a dataset via
`load_dataset()` you're going to have a bad time.

.. code-block:: python

    dataset3_reference = fo.Dataset(name="my_third_dataset")

.. code-block:: plain

    ValueError: Dataset 'my_third_dataset' already exists; use `fiftyone.load_dataset()` to load an existing dataset

.. code-block:: python

    dataset4 = fo.load_dataset(name="my_fourth_dataset")

.. code-block:: plain

    fiftyone.core.dataset.DoesNotExistError: Dataset 'my_fourth_dataset' not found

By default, datasets are non-persistent. Non-persistent datasets are wiped
from FiftyOne on exit of the python process. This means any data in the
FiftyOne backing database is deleted, however files on disk are untouched.

To make a dataset persistent, set the attribute to `True`.

.. code-block:: python

    dataset1.persistent = True
    quit()

Start a new session:

.. code-block:: python

    import fiftyone as fo

    print(fo.list_dataset_names())

.. code-block:: plain

    ['my_first_dataset']

Delete a dataset explicitly via `Dataset.delete()`. Once a dataset is deleted,
any existing reference in memory will be in a volatile state. `Dataset.name`
and `Dataset.deleted` will still be valid attributes, but calling any other
attribute or method will raise a `DoesNotExistError`.

.. code-block:: python

    dataset = fo.load_dataset("my_first_dataset")
    dataset.delete()
    print(fo.list_dataset_names())
    print(dataset.name)
    print(dataset.deleted)
    print(dataset.persistent)

.. code-block:: plain

    []
    my_first_dataset
    True
    fiftyone.core.dataset.DoesNotExistError: Dataset 'my_first_dataset' is deleted

Samples
_______

Individual `Samples` are always initialized with a file path to the
corresponding image on disk. The image is not read at this point:

.. code-block:: python

    sample = fo.Sample(filepath="path/to/image.png")

Adding Samples
--------------

`Samples` an easily be added to an existing
`Dataset`:

.. code-block:: python

    dataset = fo.Dataset(name="example_dataset")
    dataset.add_sample(sample)

When a `Sample` is added to a `Dataset`, the related attributes of the `Sample`
are automatically updated:

.. code-block:: python

    print(sample.in_dataset)
    print(sample.dataset_name)

.. code-block:: plain

    True
    example_dataset

Every `Sample` in a `Dataset` is given a unique ID when it is added:

.. code-block:: python

    print(sample.id)

.. code-block:: plain

    5ee0ebd72ceafe13e7741c42

A batch of multiple `Samples` can be added to a `Dataset` at the same time by
providing a list of `Samples`:

.. code-block:: python

    print(len(dataset))
    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/img1.jpg"),
            fo.Sample(filepath="/path/to/img2.jpg"),
            fo.Sample(filepath="/path/to/img3.jpg"),
        ]
    );
    print(len(dataset)

.. code-block:: plain

    1
    4

Accessing Samples in Datasets
-----------------------------

FiftyOne provides multiple ways to access `Samples` in a `Dataset`.

`Datasets` are iterable allowing all `Samples` to be accessed one at a time:

.. code-block:: python

    for sample in dataset:
        print(sample)

A `Sample` can be accessed directly from a `Dataset` by it's ID. The `Samples`
that are returned when accessing a `Dataset` will always provide the same
instance:

.. code-block:: python

    same_sample = dataset[sample.id]
    print(same_sample is sample)

.. code-block:: plain

    True

More ways of accessing `Samples` are provided through `DatasetViews` described
below.

Removing Samples
----------------

`Samples` can be removed from a `Dataset` through their ID, either one at a
time or in a batch:

.. code-block:: python

    del dataset[sample_id]

    dataset.remove_samples([sample_id2, sample_id3])

`Samples` can also be removed from a `Dataset` by using the `Sample` instance:

.. code-block:: python

    sample = dataset[sample_id]
    dataset.remove_sample(sample)

If the `Sample` is in memory, it will behaving the same as a `Sample` that has
never been added to the `Dataset`.

Fields
______

`Fields` are attributes of `Samples` that are shared across all `Samples` in a
`Dataset`.

By default, a `Dataset` and the `Samples` therein have two `Fields`,
`filepath`, and `tags`. All `Samples` are required to be initialized with a
`filepath`.

Accessing Fields
----------------

Available `Fields` can be found at a `Sample` or `Dataset` level:

.. code-block:: python

    sample.field_names
    dataset.get_field_schema()

The value of a `Field` for a given `Sample` can be accessed either by key or
attribute access:

.. code-block:: python

    sample.filepath
    sample["filepath"]

Adding Fields
-------------

`Fields` are added to a `Samples` one at a time:

.. code-block:: python

    sample["integer_field"] = 51
    sample.save()

`Fields` can be any primitive type: `bool`, `int`, `float`, `str`, `list`,
`dict`, or more complex data structures like `Labels`:

.. code-block:: python

    sample["ground_truth"] = fo.Classification(label="alligator")
    sample.save()

Whenever a new `Field` is added to one `Sample` in a `Dataset`, that `Field` is
added to all other `Samples` in the `Dataset` with the value `None`.

A `Field` must be the same type across every `Sample` in the `Dataset`. Setting
a `Field` to an inappropriate type raises a `ValidationError`:

.. code-block:: python

    sample2.integer_field = "a string"
    sample2.save()

.. code-block:: plain

    Error: a string could not be converted to int

.. note::

    If the `Sample` is in a `Dataset`, then `sample.save()` must be used
    whenever the `Sample` is updated.

Removing Fields
---------------

`Fields` can be deleted from every `Sample` in a `Dataset`:

.. code-block:: python

    dataset.delete_sample_field("integer_field")

`Fields` can be deleted from a `Sample` using `del`. Unlike the previous
method, this does not remove the `Field` from the `Dataset`, it just sets the
value of the `Field` to the default value for the `Sample`:

.. code-block:: python

    del sample["integer_field"]

Tags
----

`Tags` are a special `ListField` that every `Sample` has by default. They are
just a list of strings that are provided for ease of use by the user. For
example, `Tags` can be used to defined dataset splits or mark low quality
images:

.. code-block:: python

    dataset = fo.Dataset("tagged_dataset")

    dataset.add_samples(
        [
            fo.Sample(filepath="path/to/img1.png", tags=["train"]),
            fo.Sample(filepath="path/to/img2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.get_tags())

.. code-block:: plain

    {"test", "low_quality", "train"}

`Tags` can be added to a `Sample` like a standard python `list`:

.. code-block:: python

    sample.tags += ["new_tag"]
    sample.save()

.. note::

    If the `Sample` is in a `Dataset`, then `sample.save()` must be used
    whenever the `Sample` is updated.

DatasetViews
____________

Since `Datasets` are unordered collections, `Samples` cannot be accessed by an
integer index. In the previous `Sample` section, two ways of accessing
`Samples` were presented. FiftyOne provides a more flexible method of
accessing `Samples` through the use of `DatasetViews`.

The default view of a `Dataset` is a look at the entire `Dataset`. By default,
it is sorted arbitrarily:

.. code-block:: python

    print(dataset.view())

.. code-block:: plain

    fiftyone.core.view.DatasetView

Basic ways to explore `DatasetViews` are available:

.. code-block:: python

    print(len(dataset.view()))

    print(datsaet.view())

.. code-block:: plain

    2

    Dataset:        interesting_dataset
    Num samples:    2
    Tags:           ['test', 'train']
    Sample fields:
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

Accessing Samples in DatasetViews
---------------------------------

In order to look at `Samples` in a `DatasetView`, use `first()` to get the frst
sample in a `DatasetView` or `take(x)` to get a new `DatasetView` containing
`x` random `Samples`:

.. code-block:: python

    first_sample = dataset.view().first()

    new_view = dataset.view().take(2)
    print(len(new_view))

.. code-block:: plain

    2

Ranges of `Samples` can be accessed using `skip()` and `limit()` or through
array slicing:

.. code-block:: python

    # Skip the first 2 samples and take the next 3
    view = dataset.view()

    view.skip(2).limit(3)

    view[2:5]

Note that accessing an individual sample by its integer index in the view is
not supported (this is not an efficient operation with FiftyOne datasets):

.. code-block:: python

    view[0]

.. code-block:: plain

    KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"


As with `Datasets`, `Samples` in a `DatasetView` can be accessed by ID and
`DatasetViews` are iterable:

.. code-block:: python

    sample = view[sample.id]

    for sample in view:
        print(sample)

`DatasetViews` can be created by matching lists of `Sample` IDs, either to only
include given `Samples` or to include all but the given `Samples`:

.. code-block:: python

    sample_ids = [sample1.id, sample2.id]
    included = dataset.view().select(sample_ids)
    excluded = dataset.view().exclude(sample_ids)

A `DatasetView` can also be filtered to only include `Samples` for which a
given `Field` exists and is not `None`:

.. code-block:: python

    metadata_view = dataset.view().exists("metadata")

Sorting
-------

The `Samples` in a `DatasetView` can be sorted (forward or in reverse) by any
`Field`:

.. code-block:: python

    view = dataset.view().sort_by("filepath")
    view = dataset.view().sort_by("id", reverse=True)

Querying
---------

`DatasetViews` can be queried using `match()`. The syntax follows
`MongoDB queries <https://docs.mongodb.com/manual/tutorial/query-documents/>`_:

.. code-block:: python

    # Get only samples with the tag "train"
    view = dataset.view().match({"tags": "train"})

Chaining Operations
-------------------

All of the aformentioned operations can be chained together:

.. code-block:: python

    complex_view = (
        dataset.view()
        .match({"tags": "test"})
        .exists("metadata")
        .sort_by("filepath")
        .limit(5)
    )

Modifying Datasets
------------------

A `Dataset` can then be updated to remove all `Samples` in a given
`DatasetView`:

.. code-block:: python

    dataset.remove_samples(view)
