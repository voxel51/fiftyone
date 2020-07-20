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

Dataset persistence
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

Deleting a dataset
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

Adding samples to a dataset
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
            fo.Sample(filepath="/path/to/image1.jpg"),
            fo.Sample(filepath="/path/to/image2.jpg"),
            fo.Sample(filepath="/path/to/image3.jpg"),
        ]
    )

    print(len(dataset))
    # 4

Accessing samples in a dataset
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

You can :ref:`use DatasetViews <using-dataset-views>` to perform more
sophisticated operations on samples like searching, filtering, sorting, and
slicing.

Removing samples from a dataset
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

A |Field| is an attribute of a |Sample| that stores information about the
sample.

Fields can be dynamically created, modified, and deleted from samples on a
per-sample basiss. When a new |Field| is assigned to a |Sample| in a |Dataset|,
it is automatically added to the dataset's schema and thus accessible on all
other samples in the dataset. If a |Field| is unset on a particular |Sample|,
its value will be ``None``.

Default fields
--------------

By default, all |Sample| instances have the following fields:

.. table::
    :widths: 18 18 18 46

    +------------+------------------------------------+-------------+---------------------------------------------------+
    | Field      | Type                               | Default     | Description                                       |
    +============+====================================+=============+===================================================+
    | `filepath` | string                             | N/A         | `(required)` The path to the source data on disk  |
    +------------+------------------------------------+-------------+---------------------------------------------------+
    | `id`       | string                             | `None`      | The ID of the sample in its parent dataset, or    |
    |            |                                    |             | `None` if the sample does not belong to a dataset |
    +------------+------------------------------------+-------------+---------------------------------------------------+
    | `metadata` | :class:`Metadata                   |`None`       | Type-specific metadata about the source data      |
    |            | <fiftyone.core.metadata.Metadata>` |             |                                                   |
    +------------+------------------------------------+-------------+---------------------------------------------------+
    | `tags`     | list                               | `[]`        | A list of string tags for the sample              |
    +------------+------------------------------------+-------------+---------------------------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="path/to/image.png")

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'filepath': 'path/to/image.png',
        'tags': [],
        'metadata': None,
    }>

Accessing fields of a sample
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

.. code-block:: text

    OrderedDict(
        [
            ('filepath', <fiftyone.core.fields.StringField object at 0x11436e710>),
            ('tags',     <fiftyone.core.fields.ListField object at 0x11b7f2dd8>),
            ('metadata', <fiftyone.core.fields.EmbeddedDocumentField object at 0x11b7f2e80>)
        ]
    )

To to simply view the field schema print the dataset:

.. code-block:: python
    :linenos:

    print(dataset)

.. code-block:: text

    Name:           a_dataset
    Persistent:     False
    Num samples:    0
    Tags:           []
    Sample fields:
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

The value of a |Field| for a given |Sample| can be accessed either by key or
attribute access:

.. code-block:: python
    :linenos:

    sample.filepath
    sample["filepath"]

Adding fields to a sample
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

.. code-block:: text

    Name:           a_dataset
    Persistent:     False
    Num samples:    0
    Tags:           []
    Sample fields:
        filepath:      fiftyone.core.fields.StringField
        tags:          fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        integer_field: fiftyone.core.fields.IntField

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

    If a |Sample| is in a |Dataset|, then
    :meth:`sample.save() <fiftyone.core.sample.Sample.save>` must be used
    whenever the |Sample| is updated.

Removing fields from a sample
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

All |Sample| instances have a `tags` field, which is a |ListField|  of strings.
By default, this list is empty, but it can be used (for example) to define
dataset splits or mark low quality images:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset("tagged_dataset")

    dataset.add_samples(
        [
            fo.Sample(filepath="path/to/image1.png", tags=["train"]),
            fo.Sample(filepath="path/to/image2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.get_tags())
    # {"test", "low_quality", "train"}

The `tags` field can be treated like a standard Python `list`:

.. code-block:: python
    :linenos:

    sample.tags.append("new_tag")
    sample.save()

.. note::

    If a |Sample| is in a |Dataset|, then
    :meth:`sample.save() <fiftyone.core.sample.Sample.save>` must be used
    whenever the |Sample| is updated.

.. _using-labels:

Labels
______

The |Label| class hierarchy is used to store semantic information about ground
truth or predicted labels in a sample.

Although such information can be stored in custom sample fields
(e.g, in a |DictField|), it is recommended that you store label information in
|Label| instances so that the :doc:`FiftyOne App </user_guide/app>` and the
:doc:`FiftyOne Brain </user_guide/brain>` can visualize and compute on your
labels.

FiftyOne provides a dedicated |Label| subclass for many common tasks.

.. _classification:

Classification
--------------

The |Classification| class represents a classification label for an image. The
label itself is stored in the
:attr:`label <fiftyone.core.labels.Classification.label>` attribute of the
|Classification| object. This may be a ground truth label or a model
prediction.

The optional
:attr:`confidence <fiftyone.core.labels.Classification.confidence>` and
:attr:`logits <fiftyone.core.labels.Classification.logits>` attributes may be
used to store metadata about the model prediction. These additional fields can
be visualized in the App or used by Brain methods, e.g., when
:ref:`computing label mistakes <brain-label-mistakes>`.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="path/to/image.png")

    sample["ground_truth"] = fo.Classification(label="sunny")
    sample["prediction"] = fo.Classification(label="sunny", confidence=0.9)

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'filepath': 'path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Classification: {'label': 'sunny', 'confidence': None, 'logits': None}>,
        'prediction': <Classification: {'label': 'sunny', 'confidence': 0.9, 'logits': None}>,
    }>

.. _multilabel-classification:

Multilabel classification
-------------------------

The |Classifications| class represents a list of classification labels for an
image. The typical use case is to represent multilabel annotations/predictions
for an image, where multiple labels from a model may apply to a given image.
The labels are stored in a
:attr:`classifications <fiftyone.core.labels.Classifications.classifications>`
attribute of the object, which contains a list of |Classification| instances.

Metadata about individual labels can be stored in the |Classification|
instances as usual; additionally, you can optionally store logits for the
overarching model (if applicable) in the
:attr:`logits <fiftyone.core.labels.Classifications.logits>` attribute of the
|Classifications| object.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="path/to/image.png")

    sample["ground_truth"] = fo.Classifications(
        classifications=[
            fo.Classification(label="animal"),
            fo.Classification(label="cat"),
            fo.Classification(label="tabby"),
        ]
    )
    sample["prediction"] = fo.Classifications(
        classifications=[
            fo.Classification(label="animal", confidence=0.99),
            fo.Classification(label="cat", confidence=0.98),
            fo.Classification(label="tabby", confidence=0.72),
        ]
    )
    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'filepath': 'path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Classifications: {
            'classifications': BaseList([
                <Classification: {'label': 'animal', 'confidence': None, 'logits': None}>,
                <Classification: {'label': 'cat', 'confidence': None, 'logits': None}>,
                <Classification: {'label': 'tabby', 'confidence': None, 'logits': None}>,
            ]),
            'logits': None,
        }>,
        'prediction': <Classifications: {
            'classifications': BaseList([
                <Classification: {'label': 'animal', 'confidence': 0.99, 'logits': None}>,
                <Classification: {'label': 'cat', 'confidence': 0.98, 'logits': None}>,
                <Classification: {'label': 'tabby', 'confidence': 0.72, 'logits': None}>,
            ]),
            'logits': None,
        }>,
    }>

.. _object-detection:

Object detection
----------------

The |Detections| class represents a list of object detections in an image. The
detections are stored in the
:attr:`detections <fiftyone.core.labels.Detections.detections>` attribute of
the |Detections| object.

Each individual object detection is represented by a |Detection| object. The
string label of the object should be stored in the
:attr:`label <fiftyone.core.labels.Detection.label>` attribute, and the
bounding box for the object should be stored in the
:attr:`bounding_box <fiftyone.core.labels.Detection.bounding_box>` attribute.

.. note::
    FiftyOne stores box coordinates as floats in `[0 ,1]` relative to the
    dimensions of the image. Bounding boxes are represented by a length-4 list
    in the format:

    .. code-block:: text

        [<top-left-x>, <top-left-y>, <width>, <height>]

In the case of model predictions, an optional confidence score for each
detection can be stored in the
:attr:`confidence <fiftyone.core.labels.Detection.confidence>` attribute.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="path/to/image.png")

    sample["ground_truth"] = fo.Detections(
        detections=[fo.Detection(label="cat", bounding_box=[0.5, 0.5, 0.4, 0.3],),]
    )
    sample["prediction"] = fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                bounding_box=[0.480, 0.513, 0.397, 0.288],
                confidence=0.96,
            ),
        ]
    )
    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'filepath': 'path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'label': 'cat',
                    'bounding_box': array([0.5, 0.5, 0.4, 0.3]),
                    'confidence': None,
                    'attributes': BaseDict({}),
                }>,
            ]),
        }>,
        'prediction': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'label': 'cat',
                    'bounding_box': array([0.48 , 0.513, 0.397, 0.288]),
                    'confidence': 0.96,
                    'attributes': BaseDict({}),
                }>,
            ]),
        }>,
    }>

Object attributes
~~~~~~~~~~~~~~~~~

Objects may also be given attributes, which should be stored in the
:attr:`attributes <fiftyone.core.labels.Detection.attributes>` attribute of
each |Detection|; this field is a dictionary mapping attribute names to
|Attribute| instances, which contain the
:attr:`value <fiftyone.core.labels.Attribute.value>` of the attribute and any
associated metadata.

There are |Attribute| subclasses for various types of attributes you may want
to store. Use the appropriate subclass when possible so that FiftyOne knows the
schema of the attributes that you're storing.

.. table::
    :widths: 25 25 50

    +---------------------------------------------------------------------------+------------+---------------------------------+
    | Attribute class                                                           | Value type | Description                     |
    +===========================================================================+============+=================================+
    | :class:`Attribute <fiftyone.core.labels.Attribute>`                       | arbitrary  | A generic attribute of any type |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`BooleanAttribute <fiftyone.core.labels.BooleanAttribute>`         | `bool`     | A boolean attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`CategoricalAttribute <fiftyone.core.labels.CategoricalAttribute>` | `string`   | A categorical attribute         |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`NumericAttribute <fiftyone.core.labels.NumericAttribute>`         | `float`    | A numeric attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="path/to/image.png")

    sample["ground_truth"] = fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                bounding_box=[0.5, 0.5, 0.4, 0.3],
                attributes={
                    "age": fo.NumericAttribute(value=51),
                    "mood": fo.CategoricalAttribute(value="salty"),
                },
            ),
        ]
    )
    sample["prediction"] = fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                bounding_box=[0.480, 0.513, 0.397, 0.288],
                confidence=0.96,
                attributes={
                    "age": fo.NumericAttribute(value=51),
                    "mood": fo.CategoricalAttribute(
                        value="surly", confidence=0.95
                    ),
                },
            ),
        ]
    )
    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'filepath': 'path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'label': 'cat',
                    'bounding_box': array([0.5, 0.5, 0.4, 0.3]),
                    'confidence': None,
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51.0}>,
                        'mood': <CategoricalAttribute: {'value': 'salty', 'confidence': None, 'logits': None}>,
                    }),
                }>,
            ]),
        }>,
        'prediction': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'label': 'cat',
                    'bounding_box': array([0.48 , 0.513, 0.397, 0.288]),
                    'confidence': 0.96,
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51.0}>,
                        'mood': <CategoricalAttribute: {'value': 'surly', 'confidence': 0.95, 'logits': None}>,
                    }),
                }>,
            ]),
        }>,
    }>

.. _multitask-predictions:

Multitask predictions
---------------------

The |ImageLabels| class represents a collection of multitask labels for an
image. The labels are stored in the
:attr:`labels <fiftyone.core.labels.ImageLabels.labels>` attribute of the
|ImageLabels| object, which should contain an
`eta.core.image.ImageLabels <https://voxel51.com/docs/api/#types-imagelabels>`_
object.

|ImageLabels| instances can contain one or more of the following:

- frame-level classifications
- semantic segmentation masks
- object detections, optionally with attributes and/or instance segmentations

The labels can be ground truth annotations or model predictions; in the
latter case, additional metadata such as prediction confidences can be store.
See the `ImageLabels format <https://voxel51.com/docs/api/#types-imagelabels>`_
for more details.

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

.. code-block:: text

    Dataset:        interesting_dataset
    Num samples:    2
    Tags:           ['test', 'train']
    Sample fields:
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

Accessing samples in dataset views
----------------------------------

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

Removing a batch of samples from a dataset
------------------------------------------

Every |Sample| in a given |DatasetView| can be removed from a |Dataset| with a
single command:

.. code-block:: python
    :linenos:

    dataset.remove_samples(view)
