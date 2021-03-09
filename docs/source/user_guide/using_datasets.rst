.. _using-datasets:

Using FiftyOne Datasets
=======================

.. default-role:: code

After a |Dataset| has been loaded or created, FiftyOne provides powerful
functionality to inspect, search, and modify it from a |Dataset|-wide down to
a |Sample| level.

The following sections provide details of how to use various aspects of a
FiftyOne |Dataset|.

Datasets
________

Instantiating a |Dataset| object creates a new dataset.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset1 = fo.Dataset(name="my_first_dataset")
    dataset2 = fo.Dataset(name="my_second_dataset")
    dataset3 = fo.Dataset()  # generates a default unique name

Check to see what datasets exist at any time via :meth:`list_datasets()
<fiftyone.core.dataset.list_datasets>`:

.. code-block:: python
    :linenos:

    print(fo.list_datasets())
    # ['my_first_dataset', 'my_second_dataset', '2020.08.04.12.36.29']

Load a dataset using
:meth:`load_dataset() <fiftyone.core.dataset.load_dataset>`.
Dataset objects are singletons. Cool!

.. code-block:: python
    :linenos:

    _dataset2 = fo.load_dataset("my_second_dataset")
    _dataset2 is dataset2  # True

If you try to load a dataset via `Dataset(...)` or create a new dataset via
:meth:`load_dataset() <fiftyone.core.dataset.load_dataset>` you're going to
have a bad time:

.. code-block:: python
    :linenos:

    _dataset2 = fo.Dataset(name="my_second_dataset")
    # Dataset 'my_second_dataset' already exists; use `fiftyone.load_dataset()`
    # to load an existing dataset

    dataset4 = fo.load_dataset("my_fourth_dataset")
    # DoesNotExistError: Dataset 'my_fourth_dataset' not found

Dataset persistence
-------------------

By default, datasets are non-persistent. Non-persistent datasets are deleted
from the database each time the database is shut down. Note that FiftyOne does
not store the raw data in datasets directly (only the labels), so your source
files on disk are untouched.

To make a dataset persistent, set its
:meth:`persistent <fiftyone.core.dataset.Dataset.persistent>` property to
`True`:

.. code-block:: python
    :linenos:

    # Make the dataset persistent
    dataset1.persistent = True

Without closing your current Python shell, open a new shell and run:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Verify that both persistent and non-persistent datasets still exist
    print(fo.list_datasets())
    # ['my_first_dataset', 'my_second_dataset', '2020.08.04.12.36.29']

All three datasets are still available, since the database connection has not
been terminated.

However, if you exit all processes with `fiftyone` imported, then open a new
shell and run the command again:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Verify that non-persistent datasets have been deleted
    print(fo.list_datasets())
    # ['my_first_dataset']

you'll see that the `my_second_dataset` and `2020.08.04.12.36.29` datasets have
been deleted because they were not persistent.

Dataset media type
------------------

The media type of a dataset is determined by the
:ref:`media type <using-media-type>` of the |Sample| objects that it contains.

The :meth:`media_type <fiftyone.core.dataset.Dataset.media_type>` property of a
dataset is set based on the first sample added to it:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    print(dataset.media_type)
    # None

    dataset.add_sample(fo.Sample(filepath="/path/to/image.png"))

    print(dataset.media_type)
    # "image"

Datasets are homogeneous; they must contain samples of the same media type:

.. code-block:: python
    :linenos:

    dataset.add_sample(fo.Sample(filepath="/path/to/video.mp4"))
    # MediaTypeError: Sample media type 'video' does not match dataset media type 'image'

Dataset version
---------------

The version of the `fiftyone` package for which a dataset is formatted is
stored in the :meth:`version <fiftyone.core.dataset.Dataset.version>` property
of the dataset.

If you upgrade your `fiftyone` package and then load a dataset that was created
with an older version of the package, it will be automatically migrated to the
new package version (if necessary) the first time you load it.

Storing dataset information
---------------------------

All |Dataset| instances have an
:meth:`info <fiftyone.core.dataset.Dataset.info>` property, which contains a
dictionary that you can use to store any (JSON-serializable) information you
wish about your dataset.

A typical use case is to store the class list for a classification/detection
model:

.. code-block:: python

    # Store a class list in the dataset's info
    dataset1.info["classes"] = ["bird", "cat", "deer", "dog", "frog", "horse"]
    dataset1.save()

In a new Python session:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.load_dataset("my_first_dataset")

    # Load the class list for the dataset
    classes = dataset.info["classes"]
    print(classes)  # ['bird', 'cat', 'deer', ...]

Datasets can also store more specific types of ancillary information such as
mask targets for |Segmentation| fields. See
:ref:`this section <storing-mask-targets>` for more details.

.. note::

    You must call
    :meth:`dataset.save() <fiftyone.core.dataset.Dataset.save>` after updating
    the dataset's :meth:`info <fiftyone.core.dataset.Dataset.info>` property to
    save the changes to the database.

Deleting a dataset
------------------

Delete a dataset explicitly via
:meth:`Dataset.delete() <fiftyone.core.dataset.Dataset.delete>`. Once a dataset
is deleted, any existing reference in memory will be in a volatile state.
:class:`Dataset.name <fiftyone.core.dataset.Dataset>` and
:class:`Dataset.deleted <fiftyone.core.dataset.Dataset>` will still be valid
attributes, but calling any other attribute or method will raise a
:class:`DoesNotExistError <fiftyone.core.dataset.DoesNotExistError>`.

.. code-block:: python
    :linenos:

    dataset = fo.load_dataset("my_first_dataset")
    dataset.delete()

    print(fo.list_datasets())
    # []

    print(dataset.name)
    # my_first_dataset

    print(dataset.deleted)
    # True

    print(dataset.persistent)
    # DoesNotExistError: Dataset 'my_first_dataset' is deleted

.. _using-samples:

Samples
_______

An individual |Sample| is always initialized with a `filepath` to the
corresponding data on disk.

.. code-block:: python
    :linenos:

    # An image sample
    sample = fo.Sample(filepath="/path/to/image.png")

    # A video sample
    another_sample = fo.Sample(filepath="/path/to/video.mp4")

.. note::

    Creating a new |Sample| does not load the source data into memory. Source
    data is read only as needed by the App.

Adding samples to a dataset
---------------------------

A |Sample| can easily be added to an existing |Dataset|:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset(name="example_dataset")
    dataset.add_sample(sample)

When a sample is added to a dataset, the relevant attributes of the |Sample|
are automatically updated:

.. code-block:: python
    :linenos:

    print(sample.in_dataset)
    # True

    print(sample.dataset_name)
    # example_dataset

Every sample in a dataset is given a unique ID when it is added:

.. code-block:: python
    :linenos:

    print(sample.id)
    # 5ee0ebd72ceafe13e7741c42

Multiple samples can be efficiently added to a dataset in batches:

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

You can iterate over the samples in a dataset:

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

Samples can be accessed directly from datasets by their IDs or their filepaths.
|Sample| objects are singletons, so the same |Sample| instance is returned
whenever accessing the sample from the |Dataset|:

.. code-block:: python
    :linenos:

    same_sample = dataset[sample.id]
    print(same_sample is sample)
    # True

    also_same_sample = dataset[sample.filepath]
    print(also_same_sample is sample)
    # True

You can use :ref:`dataset views <using-views>` to perform more sophisticated
operations on samples like searching, filtering, sorting, and slicing.

Removing samples from a dataset
-------------------------------

Samples can be removed from a |Dataset| through their ID, either one at a time
or in batches via
:meth:`remove_sample() <fiftyone.core.dataset.Dataset.remove_sample>` and
:meth:`remove_samples() <fiftyone.core.dataset.Dataset.remove_samples>`,
respectively:

.. code-block:: python
    :linenos:

    dataset.remove_sample(sample_id)

    # equivalent to above
    del dataset[sample_id]

    dataset.remove_samples([sample_id2, sample_id3])

Samples can also be removed from a |Dataset| by passing |Sample| instance(s)
or |DatasetView| instances:

.. code-block:: python
    :linenos:

    # Remove a random sample
    sample = dataset.take(1).first()
    dataset.remove_sample(sample)

    # Remove 10 random samples
    view = dataset.take(10)
    dataset.remove_samples(view)

If a |Sample| object in memory is deleted from a dataset, it will revert to
a |Sample| that has not been added to a |Dataset|:

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
other samples in the dataset.

If a field exists on a dataset but has not been set on a particular sample, its
value will be ``None``.

Default fields
--------------

By default, all |Sample| instances have the following fields:

.. table::
    :widths: 18 18 18 46

    +--------------+------------------------------------+--------------+---------------------------------------------------+
    | Field        | Type                               | Default      | Description                                       |
    +==============+====================================+==============+===================================================+
    | `filepath`   | string                             | `(required)` |  The path to the source data on disk              |
    +--------------+------------------------------------+--------------+---------------------------------------------------+
    | `media_type` | string                             | `-`          | The media type of the sample                      |
    +--------------+------------------------------------+--------------+---------------------------------------------------+
    | `id`         | string                             | `None`       | The ID of the sample in its parent dataset, or    |
    |              |                                    |              | `None` if the sample does not belong to a dataset |
    +--------------+------------------------------------+--------------+---------------------------------------------------+
    | `metadata`   | :class:`Metadata                   | `None`       | Type-specific metadata about the source data      |
    |              | <fiftyone.core.metadata.Metadata>` |              |                                                   |
    +--------------+------------------------------------+--------------+---------------------------------------------------+
    | `tags`       | list                               | `[]`         | A list of string tags for the sample              |
    +--------------+------------------------------------+--------------+---------------------------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
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
    # ('filepath', 'media_type', 'tags', 'metadata')

You can retrieve detailed information about the schema of the samples in a
|Dataset|:

.. code-block:: python
    :linenos:

    dataset.get_field_schema()

.. code-block:: text

    OrderedDict([
        ('media_type', <fiftyone.core.fields.StringField at 0x11c77add8>),
        ('filepath', <fiftyone.core.fields.StringField at 0x11c77ae10>),
        ('tags', <fiftyone.core.fields.ListField at 0x11c790828>),
        ('metadata', <fiftyone.core.fields.EmbeddedDocumentField at 0x11c7907b8>)
    ])

You can view helpful information about a dataset, including its schema, by
printing it:

.. code-block:: python
    :linenos:

    print(dataset)

.. code-block:: text

    Name:           a_dataset
    Media type:     image
    Num samples:    0
    Persistent:     False
    Info:           {}
    Tags:           []
    Sample fields:
        media_type: fiftyone.core.fields.StringField
        filepath:   fiftyone.core.fields.StringField
        tags:       fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:   fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)

The value of a |Field| for a given |Sample| can be accessed either by either
attribute or item access:

.. code-block:: python
    :linenos:

    sample.filepath
    sample["filepath"]  # equivalent

.. _adding-sample-fields:

Adding fields to a sample
-------------------------

New fields can be added to a |Sample| using item assignment:

.. code-block:: python
    :linenos:

    sample["integer_field"] = 51
    sample.save()

If the |Sample| belongs to a |Dataset|, the dataset's field schema will be
updated to reflect the new field:

.. code-block:: python
    :linenos:

    print(dataset)

.. code-block:: text

    Name:           a_dataset
    Media type:     image
    Num samples:    0
    Persistent:     False
    Info:           {}
    Tags:           []
    Sample fields:
        media_type:    fiftyone.core.fields.StringField
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

Whenever a new field is added to a sample in a dataset, the field is available
on every other sample in the dataset with the value `None`.

Fields must have the same type (or `None`) across all samples in the dataset.
Setting a field to an inappropriate type raises an error:

.. code-block:: python
    :linenos:

    sample2.integer_field = "a string"
    sample2.save()
    # ValidationError: a string could not be converted to int

.. note::

    If a |Sample| is in a |Dataset|, then
    :meth:`sample.save() <fiftyone.core.sample.Sample.save>` must be used
    whenever the sample is updated.

Removing fields from a sample
-----------------------------

A field can be deleted from a |Sample| using `del`:

.. code-block:: python
    :linenos:

    del sample["integer_field"]
    print(sample.integer_field)
    # None

Fields can also be deleted at the |Dataset| level, in which case they are
deleted from every |Sample| in the dataset:

.. code-block:: python
    :linenos:

    dataset.delete_sample_field("integer_field")

    sample.integer_field
    # AttributeError: Sample has no field 'integer_field'

.. _using-media-type:

Media type
__________

When a |Sample| is created, its media type is inferred from the `filepath` to
the source media and available via the `media_type` attribute of the sample,
which is read-only.

Media type is inferred from the
`MIME type <https://en.wikipedia.org/wiki/Media_type>`__ of the file on disk,
as per the table below:

.. table::
    :widths: 30 30 40

    +------------+----------------+-------------------------------------------+
    | MIME type  | `media_type`   | Description                               |
    +============+================+===========================================+
    | `image/*`  | `image`        | Image sample                              |
    +------------+----------------+-------------------------------------------+
    | `video/*`  | `video`        | Video sample                              |
    +------------+----------------+-------------------------------------------+
    | other      | `-`            | Generic sample                            |
    +------------+----------------+-------------------------------------------+

.. note::
    The `filepath` of a sample can be changed after the sample is created, but
    the new filepath must have the same media type. In other words,
    `media_type` is immutable.

.. _using-tags:

Tags
____

All |Sample| instances have a `tags` field, which is a |ListField| of strings.
By default, this list is empty, but it can be used (for example) to define
dataset splits or mark low quality images:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset(name="tagged_dataset")

    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/image1.png", tags=["train"]),
            fo.Sample(filepath="/path/to/image2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.distinct("tags").values)
    # ["test", "low_quality", "train"]

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
about the raw data in the sample. The :ref:`FiftyOne App <fiftyone-app>` and
the :ref:`FiftyOne Brain <fiftyone-brain>` will use this provided metadata in
some workflows when it is available.

You can automically compute metadata for all samples in a dataset via
:meth:`Dataset.compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`.

.. tabs::

    .. group-tab:: Images

        For image samples, use the |ImageMetadata| class to store information
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
                'media_type': 'image',
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

    .. group-tab:: Videos

        For video samples, use the |VideoMetadata| class to store information
        about your video.

        |VideoMetadata| instances can also store arbitrary custom fields, but,
        by default, they provide
        :attr:`size_bytes <fiftyone.core.metadata.VideoMetadata.size_bytes>`,
        :attr:`mime_type <fiftyone.core.metadata.VideoMetadata.mime_type>`,
        :attr:`frame_width <fiftyone.core.metadata.VideoMetadata.frame_width>`,
        :attr:`frame_height <fiftyone.core.metadata.VideoMetadata.frame_height>`,
        :attr:`frame_rate <fiftyone.core.metadata.VideoMetadata.frame_rate>`,
        :attr:`total_frame_count <fiftyone.core.metadata.VideoMetadata.total_frame_count>`,
        :attr:`duration <fiftyone.core.metadata.VideoMetadata.duration>`, and
        :attr:`encoding_str <fiftyone.core.metadata.VideoMetadata.encoding_str>`
        attributes, which are `None` by default.

        FiftyOne provides a convenient
        :meth:`VideoMetadata.build_for() <fiftyone.core.metadata.VideoMetadata.build_for>`
        factory method that you can use to populate metdata for your videos:

        .. code-block:: python
            :linenos:

            video_path = "/path/to/video.mp4"

            metadata = fo.VideoMetadata.build_for(video_path)

            sample = fo.Sample(filepath=video_path, metadata=metadata)

            print(sample)

        .. code-block:: text

            <Sample: {
                'id': None,
                'media_type': 'video',
                'filepath': '/Users/Brian/Desktop/people.mp4',
                'tags': [],
                'metadata': <VideoMetadata: {
                    'size_bytes': 2038250,
                    'mime_type': 'video/mp4',
                    'frame_width': 1920,
                    'frame_height': 1080,
                    'frame_rate': 29.97002997002997,
                    'total_frame_count': 68,
                    'duration': 2.268933,
                    'encoding_str': 'avc1',
                }>,
                'frames': { <0 frames> },
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
                'media_type': '-',
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
|Label| instances so that the :ref:`FiftyOne App <fiftyone-app>` and the
:ref:`FiftyOne Brain <fiftyone-brain>` can visualize and compute on your
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

FiftyOne provides a dedicated |Label| subclass for many common tasks. The
subsections below describe them.

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

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["ground_truth"] = fo.Classification(label="sunny")
    sample["prediction"] = fo.Classification(label="sunny", confidence=0.9)

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Classification: {
            'id': '5f8708db2018186b6ef66821',
            'label': 'sunny',
            'confidence': None,
            'logits': None,
        }>,
        'prediction': <Classification: {
            'id': '5f8708db2018186b6ef66822',
            'label': 'sunny',
            'confidence': 0.9,
            'logits': None,
        }>,
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

    sample = fo.Sample(filepath="/path/to/image.png")

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
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Classifications: {
            'classifications': BaseList([
                <Classification: {
                    'id': '5f8708f62018186b6ef66823',
                    'label': 'animal',
                    'confidence': None,
                    'logits': None,
                }>,
                <Classification: {
                    'id': '5f8708f62018186b6ef66824',
                    'label': 'cat',
                    'confidence': None,
                    'logits': None,
                }>,
                <Classification: {
                    'id': '5f8708f62018186b6ef66825',
                    'label': 'tabby',
                    'confidence': None,
                    'logits': None,
                }>,
            ]),
            'logits': None,
        }>,
        'prediction': <Classifications: {
            'classifications': BaseList([
                <Classification: {
                    'id': '5f8708f62018186b6ef66826',
                    'label': 'animal',
                    'confidence': 0.99,
                    'logits': None,
                }>,
                <Classification: {
                    'id': '5f8708f62018186b6ef66827',
                    'label': 'cat',
                    'confidence': 0.98,
                    'logits': None,
                }>,
                <Classification: {
                    'id': '5f8708f62018186b6ef66828',
                    'label': 'tabby',
                    'confidence': 0.72,
                    'logits': None,
                }>,
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

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["ground_truth"] = fo.Detections(
        detections=[fo.Detection(label="cat", bounding_box=[0.5, 0.5, 0.4, 0.3])]
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
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f8709172018186b6ef66829',
                    'attributes': BaseDict({}),
                    'label': 'cat',
                    'bounding_box': BaseList([0.5, 0.5, 0.4, 0.3]),
                    'mask': None,
                    'confidence': None,
                    'index': None,
                }>,
            ]),
        }>,
        'prediction': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f8709172018186b6ef6682a',
                    'attributes': BaseDict({}),
                    'label': 'cat',
                    'bounding_box': BaseList([0.48, 0.513, 0.397, 0.288]),
                    'mask': None,
                    'confidence': 0.96,
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. _objects-with-instance-segmentations:

Objects with instance segmentations
-----------------------------------

Object detections stored in |Detections| may also have instance segmentation
masks, which should be stored in the
:attr:`mask <fiftyone.core.labels.Detection.mask>` attribute of each
|Detection|.

The mask must be a 2D NumPy array containing either booleans or 0/1 integers
encoding the extent of the instance mask within the
:attr:`bounding_box <fiftyone.core.labels.Detection.bounding_box>` of the
object. The array can be of any size; it is stretched as necessary to fill the
object's bounding box when visualizing in the App.

.. code-block:: python
    :linenos:

    import numpy as np

    import fiftyone as fo

    # Example instance mask
    mask = (np.random.randn(32, 32) > 0)

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["prediction"] = fo.Detections(
        detections=[
            fo.Detection(
                label="cat",
                bounding_box=[0.480, 0.513, 0.397, 0.288],
                mask=mask,
                confidence=0.96,
            ),
        ]
    )

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'prediction': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f8709282018186b6ef6682b',
                    'attributes': BaseDict({}),
                    'label': 'cat',
                    'bounding_box': BaseList([0.48, 0.513, 0.397, 0.288]),
                    'mask': array([[False,  True, False, ...,  True,  True, False],
                           [ True, False,  True, ..., False,  True,  True],
                           [False,  True, False, ..., False,  True, False],
                           ...,
                           [ True,  True, False, ..., False, False,  True],
                           [ True,  True,  True, ...,  True,  True, False],
                           [False,  True,  True, ..., False,  True,  True]]),
                    'confidence': 0.96,
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. _objects-with-attributes:

Objects with attributes
-----------------------

Object detections stored in |Detections| may also be given attributes, which
can be stored in the
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
    | :class:`BooleanAttribute <fiftyone.core.labels.BooleanAttribute>`         | `bool`     | A boolean attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`CategoricalAttribute <fiftyone.core.labels.CategoricalAttribute>` | `string`   | A categorical attribute         |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`NumericAttribute <fiftyone.core.labels.NumericAttribute>`         | `float`    | A numeric attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`Attribute <fiftyone.core.labels.Attribute>`                       | arbitrary  | A generic attribute of any type |
    +---------------------------------------------------------------------------+------------+---------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

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
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'ground_truth': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f87093a2018186b6ef6682c',
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51}>,
                        'mood': <CategoricalAttribute: {'value': 'salty', 'confidence': None, 'logits': None}>,
                    }),
                    'label': 'cat',
                    'bounding_box': BaseList([0.5, 0.5, 0.4, 0.3]),
                    'mask': None,
                    'confidence': None,
                    'index': None,
                }>,
            ]),
        }>,
        'prediction': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f87093a2018186b6ef6682d',
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51}>,
                        'mood': <CategoricalAttribute: {'value': 'surly', 'confidence': 0.95, 'logits': None}>,
                    }),
                    'label': 'cat',
                    'bounding_box': BaseList([0.48, 0.513, 0.397, 0.288]),
                    'mask': None,
                    'confidence': 0.96,
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. _polylines:

Polylines and polygons
----------------------

The |Polylines| class represents a list of
`polylines <https://en.wikipedia.org/wiki/Polygonal_chain>`__ or
`polygons <https://en.wikipedia.org/wiki/Polygon>`__ in an image. The polylines
are stored in the
:attr:`polylines <fiftyone.core.labels.Polylines.polylines>` attribute of the
|Polylines| object.

Each individual polyline is represented by a |Polyline| object, which
represents a set of one or more semantically related shapes in an image. The
:attr:`points <fiftyone.core.labels.Polyline.points>` attribute contains a
list of lists of ``(x, y)`` coordinates defining the vertices of each shape
in the polyline. If the polyline represents a closed curve, you can set the
:attr:`closed <fiftyone.core.labels.Polyline.closed>` attribute to ``True`` to
indicate that a line segment should be drawn from the last vertex to the first
vertex of each shape in the polyline. If the shapes should be filled when
rendering them, you can set the
:attr:`filled <fiftyone.core.labels.Polyline.filled>` attribute to ``True``.
Polylines can also have string labels, which are stored in their
:attr:`label <fiftyone.core.labels.Polyline.label>` attribute.

.. note::
    FiftyOne stores vertex coordinates as floats in `[0, 1]` relative to the
    dimensions of the image.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    # A simple polyline
    polyline1 = fo.Polyline(
        points=[[(0.3, 0.3), (0.7, 0.3), (0.7, 0.3)]],
        closed=False,
        filled=False
    )

    # A closed, filled polygon with a label
    polyline2 = fo.Polyline(
        label="triangle",
        points=[[(0.1, 0.1), (0.3, 0.1), (0.3, 0.3)]],
        closed=True,
        filled=True
    )

    sample["polylines"] = fo.Polylines(polylines=[polyline1, polyline2])

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'polylines': <Polylines: {
            'polylines': BaseList([
                <Polyline: {
                    'id': '5f87094e2018186b6ef6682e',
                    'attributes': BaseDict({}),
                    'label': None,
                    'points': BaseList([BaseList([(0.3, 0.3), (0.7, 0.3), (0.7, 0.3)])]),
                    'index': None,
                    'closed': False,
                    'filled': False,
                }>,
                <Polyline: {
                    'id': '5f87094e2018186b6ef6682f',
                    'attributes': BaseDict({}),
                    'label': 'triangle',
                    'points': BaseList([BaseList([(0.1, 0.1), (0.3, 0.1), (0.3, 0.3)])]),
                    'index': None,
                    'closed': True,
                    'filled': True,
                }>,
            ]),
        }>,
    }>

.. _polylines-with-attributes:

Polylines with attributes
-------------------------

Polylines stored in |Polylines| may also be given attributes, which can be
stored in the
:attr:`attributes <fiftyone.core.labels.Polyline.attributes>` attribute of
each |Polyline|; this field is a dictionary mapping attribute names to
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
    | :class:`BooleanAttribute <fiftyone.core.labels.BooleanAttribute>`         | `bool`     | A boolean attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`CategoricalAttribute <fiftyone.core.labels.CategoricalAttribute>` | `string`   | A categorical attribute         |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`NumericAttribute <fiftyone.core.labels.NumericAttribute>`         | `float`    | A numeric attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`Attribute <fiftyone.core.labels.Attribute>`                       | arbitrary  | A generic attribute of any type |
    +---------------------------------------------------------------------------+------------+---------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    # A simple polyline
    polyline = fo.Polyline(
        points=[[(0.3, 0.3), (0.7, 0.3), (0.7, 0.3)]],
        closed=False,
        filled=False,
        attributes={
            "length": fo.NumericAttribute(value=3),
            "shape": fo.CategoricalAttribute(value="L"),
        },
    )

    sample["polylines"] = fo.Polylines(polylines=[polyline])

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'polylines': <Polylines: {
            'polylines': BaseList([
                <Polyline: {
                    'id': '5f8709602018186b6ef66830',
                    'attributes': BaseDict({
                        'length': <NumericAttribute: {'value': 3}>,
                        'shape': <CategoricalAttribute: {'value': 'L', 'confidence': None, 'logits': None}>,
                    }),
                    'label': None,
                    'points': BaseList([BaseList([(0.3, 0.3), (0.7, 0.3), (0.7, 0.3)])]),
                    'index': None,
                    'closed': False,
                    'filled': False,
                }>,
            ]),
        }>,
    }>

.. _keypoints:

Keypoints
---------

The |Keypoints| class represents a list of keypoints in an image. The keypoints
are stored in the
:attr:`keypoints <fiftyone.core.labels.Keypoints.keypoints>` attribute of the
|Keypoints| object.

Each element of this list is a |Keypoint| object whose
:attr:`points <fiftyone.core.labels.Keypoint.points>` attribute contains a
list of ``(x, y)`` coordinates defining a set of keypoints in the image. Each
|Keypoint| object can have a string label, which is stored in its
:attr:`label <fiftyone.core.labels.Keypoint.label>` attribute.

.. note::
    FiftyOne stores keypoint coordinates as floats in `[0, 1]` relative to the
    dimensions of the image.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["keypoints"] = fo.Keypoints(
        keypoints=[
            fo.Keypoint(
                label="square",
                points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)]
            )
        ]
    )

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'keypoints': <Keypoints: {
            'keypoints': BaseList([
                <Keypoint: {
                    'id': '5f8709702018186b6ef66831',
                    'attributes': BaseDict({}),
                    'label': 'square',
                    'points': BaseList([(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)]),
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. _keypoints-with-attributes:

Keypoints with attributes
-------------------------

Keypoints stored in |Keypoints| may also be given attributes, which can be
stored in the
:attr:`attributes <fiftyone.core.labels.Keypoint.attributes>` attribute of
each |Keypoint|; this field is a dictionary mapping attribute names to
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
    | :class:`BooleanAttribute <fiftyone.core.labels.BooleanAttribute>`         | `bool`     | A boolean attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`CategoricalAttribute <fiftyone.core.labels.CategoricalAttribute>` | `string`   | A categorical attribute         |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`NumericAttribute <fiftyone.core.labels.NumericAttribute>`         | `float`    | A numeric attribute             |
    +---------------------------------------------------------------------------+------------+---------------------------------+
    | :class:`Attribute <fiftyone.core.labels.Attribute>`                       | arbitrary  | A generic attribute of any type |
    +---------------------------------------------------------------------------+------------+---------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    keypoint = fo.Keypoint(
        label="square",
        points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
        attributes={
            "corners": fo.NumericAttribute(value=4),
            "convex": fo.BooleanAttribute(value=True),
        },
    )

    sample["keypoints"] = fo.Keypoints(keypoints=[keypoint])

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'keypoints': <Keypoints: {
            'keypoints': BaseList([
                <Keypoint: {
                    'id': '5f87097e2018186b6ef66832',
                    'attributes': BaseDict({
                        'corners': <NumericAttribute: {'value': 4}>,
                        'convex': <BooleanAttribute: {'value': True}>,
                    }),
                    'label': 'square',
                    'points': BaseList([(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)]),
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. _semantic-segmentation:

Semantic segmentation
---------------------

The |Segmentation| class represents a semantic segmentation mask for an image.
The mask itself is stored in the
:attr:`mask <fiftyone.core.labels.Segmentation.mask>` attribute of the
|Segmentation| object.

The mask should be a 2D NumPy array with integer values encoding the semantic
labels for each pixel in the image. The array can be of any size; it is
stretched as necessary to fit the image's extent when visualizing in the App.

.. code-block:: python
    :linenos:

    import numpy as np

    import fiftyone as fo

    # Example segmentation mask
    mask = np.random.randint(10, size=(128, 128))

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["segmentation"] = fo.Segmentation(mask=mask)

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'segmentation': <Segmentation: {
            'mask': array([[3, 1, 0, ..., 1, 1, 9],
                   [5, 5, 4, ..., 1, 8, 7],
                   [7, 7, 7, ..., 2, 2, 4],
                   ...,
                   [1, 0, 4, ..., 8, 8, 5],
                   [4, 3, 8, ..., 1, 9, 8],
                   [0, 2, 5, ..., 5, 3, 2]]),
        }>,
    }>

When you load datasets with |Segmentation| fields in the App, each pixel value
is rendered as a distinct color.

.. note::

    The mask value ``0`` is a reserved "background" class that is rendered as
    invislble in the App.

.. _storing-mask-targets:

Storing mask targets
--------------------

All |Dataset| instances have
:meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>` and
:meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
properties that you can use to store label strings for the pixel values of
|Segmentation| field masks.

The :meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>` property
is a dictionary mapping field names to target dicts, each of which is a
dictionary defining the mapping between pixel values and label strings for the
|Segmentation| masks in the specified field of the dataset.

If all |Segmentation| fields in your dataset have the same semantics, you can
store a single target dictionary in the
:meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
property of your dataset.

When you load datasets with |Segmentation| fields in the App that have
corresponding mask targets, the label strings will appear in the App's tooltip
when you hover over pixels.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # Set default mask targets
    dataset.default_mask_targets = {1: "cat", 2: "dog"}

    # Edit the default mask targets
    dataset.default_mask_targets[255] = "other"
    dataset.save()  # must save after edits

    # Set mask targets for the `ground_truth` and `predictions` fields
    dataset.mask_targets = {
        "ground_truth": {1: "cat", 2: "dog"},
        "predictions": {1: "cat": 2: "dog", 255: "other"},
    }

    # Edit an existing mask target
    dataset.mask_targets["ground_truth"][255] = "other"
    dataset.save()  # must save after edits

.. note::

    You must call
    :meth:`dataset.save() <fiftyone.core.dataset.Dataset.save>` after updating
    the dataset's
    :meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
    and
    :meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>`
    properties to save the changes to the database.

.. _video-frame-labels:

Video frame labels
------------------

When you create a video sample (i.e., a |Sample| with `media_type == 'video'`),
it is given a reserved `frames` attribute in which you can store frame-level
labels for the video.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/video.mp4")

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'video',
        'filepath': '/path/to/video.mp4',
        'tags': [],
        'metadata': None,
        'frames': { <0 frames> },
    }>

The `frames` attribute of a video sample is a dictionary whose keys are frame
numbers and whose values are |Frame| instances that hold all of the |Label|
instances for the frame.

.. note::

    FiftyOne uses 1-based indexing for video frame numbers.

You can add, modify, and delete :ref:`labels of any type <using-labels>` on the
frames of the video using the same dynamic attribute syntax that you use to
interact with |Sample| objects:

.. code:: python
    :linenos:

    # Add labels to first frame of a video sample

    frame = sample.frames[1]

    frame["weather"] = fo.Classification(label="sunny")

    frame["objects"] = fo.Detections(
        detections=[
            fo.Detection(label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2]),
            fo.Detection(label="dog", bounding_box=[0.7, 0.7, 0.2, 0.2]),
        ]
    )

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'video',
        'filepath': '/path/to/video.mp4',
        'tags': [],
        'metadata': None,
        'frames': { <1 frame> },    <-- `frames` now contains 1 frame of labels
    }>

.. note::

    The `frames` attribute of video samples behaves like a defaultdict; a new
    |Frame| will be created if the frame number does not exist when you access
    it.

You can iterate over the frames in a video sample using the expected syntax:

.. code:: python
    :linenos:

    for frame_number, frame in sample.frames.items():
        print(frame_number)
        print(frame)

.. code-block:: text

    <Frame: {
        'id': None,
        'weather': <Classification: {
            'id': '5f750a77f23c456448ebf700',
            'label': 'sunny',
            'confidence': None,
            'logits': None,
        }>,
        'objects': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '5f750a77f23c456448ebf701',
                    'label': 'cat',
                    'bounding_box': BaseList([0.1, 0.1, 0.2, 0.2]),
                    'confidence': None,
                    'attributes': BaseDict({}),
                }>,
                <Detection: {
                    'id': '5f750a77f23c456448ebf702',
                    'label': 'dog',
                    'bounding_box': BaseList([0.7, 0.7, 0.2, 0.2]),
                    'confidence': None,
                    'attributes': BaseDict({}),
                }>,
            ]),
        }>,
    }>

:ref:`See this page <manually-building-datasets>` for more information about
building labeled video samples.

DatasetViews
____________

Previous sections have demonstrated how to add and interact with |Dataset|
components like samples, fields, and labels. The true power of FiftyOne lies in
the ability to search, sort, filter, and explore the contents of a |Dataset|.

Behind this power is the |DatasetView|. Whenever an operation
like :meth:`match() <fiftyone.core.view.DatasetView.match>` or
:meth:`sort_by() <fiftyone.core.view.DatasetView.sort_by>` is applied to a
dataset, a |DatasetView| is returned. As the name implies, a |DatasetView|
is a *view* into the data in your |Dataset| that was produced by a series of
operations that manipulated your data in different ways.

A |DatasetView| is composed of |SampleView| objects for a subset of the samples
in your dataset. For example, a view may contain only samples with a given tag,
or samples whose labels meet a certain criteria.

In turn, each |SampleView| represents a view into the content of the underlying
|Sample| in the datset. For example, a |SampleView| may represent the contents
of a sample with |Detections| below a specified threshold filtered out.

.. custombutton::
    :button_text: Learn more about DatasetViews
    :button_link: using_views.html
