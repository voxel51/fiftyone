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

.. _accessing-samples-in-a-dataset:

Accessing samples in a dataset
------------------------------

FiftyOne provides multiple ways to access a |Sample| in a |Dataset|.

A |Dataset| is iterable allowing every |Sample| to be accessed one at a time:

.. code-block:: python
    :linenos:

    for sample in dataset:
        print(sample)

Use :meth:`first() <fiftyone.core.dataset.Dataset.first>` and
:meth:`last() <fiftyone.core.dataset.Dataset.last>` to retrieve the first and
last samples in a dataset, respectively:

.. code-block:: python
    :linenos:

    first_sample = dataset.first()
    last_sample = dataset.last()

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
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

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
____

All |Sample| instances have a `tags` field, which is a |ListField| of strings.
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

.. _using-metadata:

Metadata
________

All |Sample| instances have a `metadata` field, which can optionally be
populated with a |Metadata| instance that stores data type-specific metadata
about the raw data in the sample. The :doc:`FiftyOne App </user_guide/app>` and
the :doc:`FiftyOne Brain </user_guide/brain>` will use this provided metadata
in some workflows when it is available.

.. tabs::

    .. group-tab:: Images

        For image data, use the |ImageMetadata| class to store information
        about your image.

        |ImageMetadata| instances can also store arbitrary custom fields, but,
        by default, they provide
        :attr:`size_bytes <fiftyone.core.metadata.ImageMetadata.size_bytes>`,
        :attr:`mime_type <fiftyone.core.metadata.ImageMetadata.mime_type>`,
        :attr:`width <fiftyone.core.metadata.ImageMetadata.width>`,
        :attr:`height <fiftyone.core.metadata.ImageMetadata.height>`, and
        :attr:`num_channels <fiftyone.core.metadata.ImageMetadata.num_channels>`
        attributes, which are `None` by default.

        FiftyOne provides a convenient
        :meth:`ImageMetadata.build_for() <fiftyone.core.metadata.ImageMetadata.build_for>`
        factory method that you can use to populate metdata for your images:

        .. code-block:: python
            :linenos:

            image_path = "/path/to/image.png"

            metadata = fo.ImageMetadata.build_for(image_path)

            sample = fo.Sample(filepath=image_path, metadata=metadata)

            print(sample)

        .. code-block:: text

            <Sample: {
                'id': None,
                'filepath': '/path/to/image.png',
                'tags': [],
                'metadata': <ImageMetadata: {
                    'size_bytes': 544559,
                    'mime_type': 'image/png',
                    'width': 698,
                    'height': 664,
                    'num_channels': 3,
                }>,
            }>

    .. group-tab:: Generic data

        For generic data, use the |Metadata| class to store information about
        your sample.

        |Metadata| instances can store arbitrary custom fields as desired, but,
        by default, they provide
        :attr:`size_bytes <fiftyone.core.metadata.Metadata.size_bytes>` and
        :attr:`mime_type <fiftyone.core.metadata.Metadata.mime_type>`
        attributes, which are `None` by default.

        FiftyOne provides a convenient
        :meth:`Metadata.build_for() <fiftyone.core.metadata.Metadata.build_for>`
        factory method that you can use to populate metdata for your samples:

        .. code-block:: python
            :linenos:

            data_path = "/path/to/data.zip"

            metadata = fo.Metadata.build_for(data_path)

            sample = fo.Sample(filepath=data_path, metadata=metadata)

            print(sample)

        .. code-block:: text

            <Sample: {
                'id': None,
                'filepath': '/path/to/data.zip',
                'tags': [],
                'metadata': <Metadata: {
                    'size_bytes': 544559,
                    'mime_type': 'application/zip',
                }>,
            }>

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

.. note::

    All |Label| instances are dynamic! You can add custom fields to your
    labels to store custom information:

    .. code-block:: python

        # Provide some default fields
        label = fo.Classification(label="cat", confidence=0.98)

        # Add custom fields
        label["int"] = 5
        label["float"] = 51.0
        label["list"] = [1, 2, 3]
        label["bool"] = True
        label["dict"] = {"key": ["list", "of", "values"]}

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
    FiftyOne stores box coordinates as floats in `[0, 1]` relative to the
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

.. -objects-with-attributes:

Objects with attributes
-----------------------

Object detections stored in |Detections| may also be given attributes, which
should be stored in the
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
subsets of samples in a |Dataset|.

Creating DatasetViews
---------------------

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

In practice, you are going to want to use dataset views when sorting or
filtering samples. The |Dataset| class directly exposes a number of operations
that return |DatasetView| instances defined by a |ViewStage|:

.. code-block:: python
    :linenos:

    print(dataset.list_view_stages())
    # ['exclude', 'exists', 'limit', ..., 'skip', 'sort_by', 'take']

We'll discuss these operations in more detail in the following sections.

Accessing samples in DatasetViews
---------------------------------

Samples can be accessed from views in
:ref:`all the same ways as for datasets <accessing-samples-in-a-dataset>`.

.. note::

    Note that accessing a sample by its integer index in a |DatasetView| is
    not allowed, as this conflicts with access by ID.

    The best practice is to lookup individual samples by ID, or use array
    slicing to extract a range of samples, and iterate over samples in a view.

    .. code-block:: python

        view[0]
        # KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"

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
-------

The samples in a |DatasetView| can be sorted by any |Field|:

.. code-block:: python
    :linenos:

    filepath_sorted_view = view.sort_by("filepath")
    id_sorted_view = view.sort_by("id", reverse=True)

Slicing
-------

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

Querying
--------

A |DatasetView| can be queried using :meth:`match()
<fiftyone.core.view.DatasetView.match>`. The syntax follows
`MongoDB queries <https://docs.mongodb.com/manual/tutorial/query-documents/>`_:

.. code-block:: python
    :linenos:

    # Get only samples with the tag "train"
    train_view = view.match({"tags": "train"})

Convenience functions for common queries are also available.

A |DatasetView| can be created by matching lists of |Sample| IDs, either to
only include given a |Sample| or to include all but the given |Sample|:

.. code-block:: python
    :linenos:

    sample_ids = [sample1.id, sample2.id]

    included_view = view.select(sample_ids)
    excluded_view = view.exclude(sample_ids)

A |DatasetView| can also be filtered to only include samples for which a
given |Field| exists and is not ``None``:

.. code-block:: python
    :linenos:

    metadata_view = view.exists("metadata")

Advanced Querying
+++++++++++++++++

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


Chaining view stages
--------------------

All of the aformentioned view stages can be chained together:

.. code-block:: python
    :linenos:

    complex_view = (
        dataset.match({"tags": "test"})
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
