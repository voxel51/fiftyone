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

    dataset1 = fo.Dataset("my_first_dataset")
    dataset2 = fo.Dataset("my_second_dataset")
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

    _dataset2 = fo.Dataset("my_second_dataset")
    # Dataset 'my_second_dataset' already exists; use `fiftyone.load_dataset()`
    # to load an existing dataset

    dataset4 = fo.load_dataset("my_fourth_dataset")
    # DoesNotExistError: Dataset 'my_fourth_dataset' not found

.. _dataset-persistence:

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

.. _storing-info:

Storing info
------------

All |Dataset| instances have an
:meth:`info <fiftyone.core.dataset.Dataset.info>` property, which contains a
dictionary that you can use to store any JSON-serializable information you wish
about your dataset.

Datasets can also store more specific types of ancillary information such as
:ref:`class lists <storing-classes>` and
:ref:`mask targets <storing-mask-targets>`.

.. code-block:: python

    import fiftyone as fo

    dataset = fo.Dataset()

    # Store a class list in the dataset's info
    dataset.info = {
        "dataset_source": "https://...",
        "author": "...",
    }

    # Edit existing info
    dataset.info["owner"] = "..."
    dataset.save()  # must save after edits

.. note::

    You must call
    :meth:`dataset.save() <fiftyone.core.dataset.Dataset.save>` after updating
    the dataset's :meth:`info <fiftyone.core.dataset.Dataset.info>` property to
    save the changes to the database.

.. _storing-classes:

Storing class lists
-------------------

All |Dataset| instances have
:meth:`classes <fiftyone.core.dataset.Dataset.classes>` and
:meth:`default_classes <fiftyone.core.dataset.Dataset.default_classes>`
properties that you can use to store the lists of possible classes for your
annotations/models.

The :meth:`classes <fiftyone.core.dataset.Dataset.classes>` property is a
dictionary mapping field names to class lists for a single |Label| field of the
dataset.

If all |Label| fields in your dataset have the same semantics, you can store a
single class list in the store a single target dictionary in the
:meth:`default_classes <fiftyone.core.dataset.Dataset.default_classes>`
property of your dataset.

These class lists are automatically used, if available, by methods such as
:meth:`evaluate_classifications() <fiftyone.core.collections.SampleCollection.evaluate_classifications>`,
:meth:`evaluate_detections() <fiftyone.core.collections.SampleCollection.evaluate_detections>`,
and :meth:`export() <fiftyone.core.collections.SampleCollection.export>` that
require knowledge of the possible classes in a dataset or field(s).

.. code-block:: python
    :linenos:

    import fiftyone as fo

    dataset = fo.Dataset()

    # Set default classes
    dataset.default_classes = ["cat", "dog"]

    # Edit the default classes
    dataset.default_classes.append("other")
    dataset.save()  # must save after edits

    # Set classes for the `ground_truth` and `predictions` fields
    dataset.classes = {
        "ground_truth": ["cat", "dog"],
        "predictions": ["cat", "dog", "other"],
    }

    # Edit a field's classes
    dataset.classes["ground_truth"].append("other")
    dataset.save()  # must save after edits

.. note::

    You must call
    :meth:`dataset.save() <fiftyone.core.dataset.Dataset.save>` after updating
    the dataset's :meth:`classes <fiftyone.core.dataset.Dataset.classes>` and
    :meth:`default_classes <fiftyone.core.dataset.Dataset.default_classes>`
    properties to save the changes to the database.

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

Mask targets are also automatically used, if available, by methods such as
:meth:`evaluate_segmentations() <fiftyone.core.collections.SampleCollection.evaluate_segmentations>`
and :meth:`export() <fiftyone.core.collections.SampleCollection.export>` that
require knowledge of the mask targets for a dataset or field(s).

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
        "predictions": {1: "cat", 2: "dog", 255: "other"},
    }

    # Edit an existing mask target
    dataset.mask_targets["ground_truth"][255] = "other"
    dataset.save()  # must save after edits

.. note::

    You must call
    :meth:`dataset.save() <fiftyone.core.dataset.Dataset.save>` after updating
    the dataset's
    :meth:`mask_targets <fiftyone.core.dataset.Dataset.mask_targets>` and
    :meth:`default_mask_targets <fiftyone.core.dataset.Dataset.default_mask_targets>`
    properties to save the changes to the database.

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

    dataset = fo.Dataset("example_dataset")
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

Deleting samples from a dataset
-------------------------------

Samples can be removed from a |Dataset| through their ID, either one at a time
or in batches via
:meth:`delete_samples() <fiftyone.core.dataset.Dataset.delete_samples>`:

.. code-block:: python
    :linenos:

    dataset.delete_samples(sample_id)

    # equivalent to above
    del dataset[sample_id]

    dataset.delete_samples([sample_id2, sample_id3])

Samples can also be removed from a |Dataset| by passing |Sample| instance(s)
or |DatasetView| instances:

.. code-block:: python
    :linenos:

    # Remove a random sample
    sample = dataset.take(1).first()
    dataset.delete_samples(sample)

    # Remove 10 random samples
    view = dataset.take(10)
    dataset.delete_samples(view)

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
per-sample basis. When a new |Field| is assigned to a |Sample| in a |Dataset|,
it is automatically added to the dataset's schema and thus accessible on all
other samples in the dataset.

If a field exists on a dataset but has not been set on a particular sample, its
value will be ``None``.

Default fields
--------------

By default, all |Sample| instances have the following fields:

.. table::
    :widths: 18 18 18 46

    +--------------+------------------------------------+---------------+---------------------------------------------------+
    | Field        | Type                               | Default       | Description                                       |
    +==============+====================================+===============+===================================================+
    | `id`         | string                             | `None`        | The ID of the sample in its parent dataset, which |
    |              |                                    |               | is generated automatically when the sample is     |
    |              |                                    |               | added to a dataset, or `None` if the sample does  |
    |              |                                    |               | not belong to a dataset                           |
    +--------------+------------------------------------+---------------+---------------------------------------------------+
    | `media_type` | string                             | N/A           | The media type of the sample. Computed            |
    |              |                                    |               | automatically from the provided `filepath`        |
    +--------------+------------------------------------+---------------+---------------------------------------------------+
    | `filepath`   | string                             | **REQUIRED**  | The path to the source data on disk. Must be      |
    |              |                                    |               | provided at sample creation time                  |
    +--------------+------------------------------------+---------------+---------------------------------------------------+
    | `metadata`   | :class:`Metadata                   | `None`        | Type-specific metadata about the source data      |
    |              | <fiftyone.core.metadata.Metadata>` |               |                                                   |
    +--------------+------------------------------------+---------------+---------------------------------------------------+
    | `tags`       | list                               | `[]`          | A list of string tags for the sample              |
    +--------------+------------------------------------+---------------+---------------------------------------------------+

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
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
    Tags:           []
    Sample fields:
        id:         fiftyone.core.fields.ObjectIdField
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
    Tags:           []
    Sample fields:
        id:            fiftyone.core.fields.ObjectIdField
        media_type:    fiftyone.core.fields.StringField
        filepath:      fiftyone.core.fields.StringField
        tags:          fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        integer_field: fiftyone.core.fields.IntField

A |Field| can be any primitive type, such as `bool`, `int`, `float`, `str`,
`list`, `dict`, or more complex data structures
:ref:`like label types <using-labels>`:

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

    You must call :meth:`sample.save() <fiftyone.core.sample.Sample.save>` in
    order to persist changes to the database when editing samples that are in
    datasets.

.. _editing-sample-fields:

Editing sample fields
---------------------

You can make any edits you wish to the fields of an existing |Sample|:

.. code-block:: python
    :linenos:

    sample = fo.Sample(
        filepath="/path/to/image.jpg",
        ground_truth=fo.Detections(
            detections=[
                fo.Detection(label="CAT", bounding_box=[0.1, 0.1, 0.4, 0.4]),
                fo.Detection(label="dog", bounding_box=[0.5, 0.5, 0.4, 0.4]),
            ]
        )
    )

    detections = sample.ground_truth.detections

    # Edit an existing detection
    detections[0].label = "cat"

    # Add a new detection
    new_detection = fo.Detection(label="animals", bounding_box=[0, 0, 1, 1])
    detections.append(new_detection)

    print(sample)

    sample.save()  # if the sample is in a dataset

.. note::

    You must call :meth:`sample.save() <fiftyone.core.sample.Sample.save>` in
    order to persist changes to the database when editing samples that are in
    datasets.

.. _removing-sample-fields:

Removing fields from a sample
-----------------------------

A field can be deleted from a |Sample| using `del`:

.. code-block:: python
    :linenos:

    del sample["integer_field"]

If the |Sample| is not yet in a dataset, deleting a field will remove it from
the sample. If the |Sample| is in a dataset, the field's value will be `None`.

Fields can also be deleted at the |Dataset| level, in which case they are
removed from every |Sample| in the dataset:

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

All |Sample| instances have a `tags` field, which is a string list. By default,
this list is empty, but you can use it to store information like dataset splits
or application-specific issues like low quality images:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset("tagged_dataset")

    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/image1.png", tags=["train"]),
            fo.Sample(filepath="/path/to/image2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.distinct("tags"))
    # ["test", "low_quality", "train"]

.. note::

    Did you know? You can add, edit, and filter by sample tags
    :ref:`directly in the App <app-tagging>`.

The `tags` field can be used like a standard Python list:

.. code-block:: python
    :linenos:

    sample.tags.append("new_tag")
    sample.save()

.. note::

    You must call :meth:`sample.save() <fiftyone.core.sample.Sample.save>` in
    order to persist changes to the database when editing samples that are in
    datasets.

.. _using-metadata:

Metadata
________

All |Sample| instances have a `metadata` field, which can optionally be
populated with a |Metadata| instance that stores data type-specific metadata
about the raw data in the sample. The :ref:`FiftyOne App <fiftyone-app>` and
the :ref:`FiftyOne Brain <fiftyone-brain>` will use this provided metadata in
some workflows when it is available.

.. tabs::

    .. group-tab:: Images

        For image samples, the |ImageMetadata| class is used to store
        information about images, including their
        :attr:`size_bytes <fiftyone.core.metadata.ImageMetadata.size_bytes>`,
        :attr:`mime_type <fiftyone.core.metadata.ImageMetadata.mime_type>`,
        :attr:`width <fiftyone.core.metadata.ImageMetadata.width>`,
        :attr:`height <fiftyone.core.metadata.ImageMetadata.height>`, and
        :attr:`num_channels <fiftyone.core.metadata.ImageMetadata.num_channels>`.

        You can populate the `metadata` field of an existing dataset by calling
        :meth:`Dataset.compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`:

        .. code-block:: python
            :linenos:

            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            # Populate metadata fields (if necessary)
            dataset.compute_metadata()

            print(dataset.first())

        Alternatively, FiftyOne provides a
        :meth:`ImageMetadata.build_for() <fiftyone.core.metadata.ImageMetadata.build_for>`
        factory method that you can use to compute the metadata for your images
        when constructing |Sample| instances:

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

        For video samples, the |VideoMetadata| class is used to store
        information about videos, including their
        :attr:`size_bytes <fiftyone.core.metadata.VideoMetadata.size_bytes>`,
        :attr:`mime_type <fiftyone.core.metadata.VideoMetadata.mime_type>`,
        :attr:`frame_width <fiftyone.core.metadata.VideoMetadata.frame_width>`,
        :attr:`frame_height <fiftyone.core.metadata.VideoMetadata.frame_height>`,
        :attr:`frame_rate <fiftyone.core.metadata.VideoMetadata.frame_rate>`,
        :attr:`total_frame_count <fiftyone.core.metadata.VideoMetadata.total_frame_count>`,
        :attr:`duration <fiftyone.core.metadata.VideoMetadata.duration>`, and
        :attr:`encoding_str <fiftyone.core.metadata.VideoMetadata.encoding_str>`.

        You can populate the `metadata` field of an existing dataset by calling
        :meth:`Dataset.compute_metadata() <fiftyone.core.collections.SampleCollection.compute_metadata>`:

        .. code-block:: python
            :linenos:

            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-video")

            # Populate metadata fields (if necessary)
            dataset.compute_metadata()

            print(dataset.first())

        Alternatively, FiftyOne provides a
        :meth:`VideoMetadata.build_for() <fiftyone.core.metadata.VideoMetadata.build_for>`
        factory method that you can use to compute the metadata for your videos
        when constructing |Sample| instances:

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
                'frames': <Frames: 0>,
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

    You can view custom attributes in the :ref:`App tooltip <app-sample-view>`
    by hovering over the objects.

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

.. note::

    Did you know? You can :ref:`store class lists <storing-classes>` for your
    models on your datasets.

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

.. note::

    Did you know? You can :ref:`store class lists <storing-classes>` for your
    models on your datasets.

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

.. note::

    Did you know? You can :ref:`store class lists <storing-classes>` for your
    models on your datasets.

Like all |Label| types, you can also add custom attributes to your detections
by dynamically adding new fields to each |Detection| instance:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    detection = fo.Detection(
        label="cat",
        bounding_box=[0.5, 0.5, 0.4, 0.3],
        age=51,  # custom attribute
        mood="salty",  # custom attribute
    )

    print(detection)

.. code-block:: text

    <Detection: {
        'id': '60f7458c467d81f41c200551',
        'attributes': BaseDict({}),
        'tags': BaseList([]),
        'label': 'cat',
        'bounding_box': BaseList([0.5, 0.5, 0.4, 0.3]),
        'mask': None,
        'confidence': None,
        'index': None,
        'age': 51,
        'mood': 'salty',
    }>

You can also use :ref:`label attributes <label-attributes>` to store custom
attributes with additional metadata such as prediction confidences.

.. note::

    Did you know? You can view custom attributes in the
    :ref:`App tooltip <app-sample-view>` by hovering over the objects.

.. _instance-segmentation:

Instance segmentations
----------------------

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

Like all |Label| types, you can also add custom attributes to your detections
by dynamically adding new fields to each |Detection| instance:

.. code-block:: python
    :linenos:

    import numpy as np
    import fiftyone as fo

    detection = fo.Detection(
        label="cat",
        bounding_box=[0.5, 0.5, 0.4, 0.3],
        mask=np.random.randn(32, 32) > 0,
        age=51,  # custom attribute
        mood="salty",  # custom attribute
    )

    print(detection)

.. code-block:: text

    <Detection: {
        'id': '60f74568467d81f41c200550',
        'attributes': BaseDict({}),
        'tags': BaseList([]),
        'label': 'cat',
        'bounding_box': BaseList([0.5, 0.5, 0.4, 0.3]),
        'mask': array([[False, False,  True, ...,  True,  True, False],
               [ True,  True, False, ...,  True, False,  True],
               [False, False,  True, ..., False, False, False],
               ...,
               [False, False,  True, ...,  True,  True, False],
               [ True, False,  True, ...,  True, False,  True],
               [False,  True, False, ...,  True,  True,  True]]),
        'confidence': None,
        'index': None,
        'age': 51,
        'mood': 'salty',
    }>

You can also use :ref:`label attributes <label-attributes>` to store custom
attributes with additional metadata such as prediction confidences.

.. note::

    Did you know? You can view custom attributes in the
    :ref:`App tooltip <app-sample-view>` by hovering over the objects.

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
        filled=False,
    )

    # A closed, filled polygon with a label
    polyline2 = fo.Polyline(
        label="triangle",
        points=[[(0.1, 0.1), (0.3, 0.1), (0.3, 0.3)]],
        closed=True,
        filled=True,
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

Like all |Label| types, you can also add custom attributes to your polylines by
dynamically adding new fields to each |Polyline| instance:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    polyline = fo.Polyline(
        label="triangle",
        points=[[(0.1, 0.1), (0.3, 0.1), (0.3, 0.3)]],
        closed=True,
        filled=True,
        kind="right",  # custom attribute
    )

    print(polyline)

.. code-block:: text

    <Polyline: {
        'id': '60f746b4467d81f41c200555',
        'attributes': BaseDict({}),
        'tags': BaseList([]),
        'label': 'triangle',
        'points': BaseList([BaseList([(0.1, 0.1), (0.3, 0.1), (0.3, 0.3)])]),
        'confidence': None,
        'index': None,
        'closed': True,
        'filled': True,
        'kind': 'right',
    }>

You can also use :ref:`label attributes <label-attributes>` to store custom
attributes with additional metadata such as prediction confidences.

.. note::

    Did you know? You can view custom attributes in the
    :ref:`App tooltip <app-sample-view>` by hovering over the objects.

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

Like all |Label| types, you can also add custom attributes to your keypoints by
dynamically adding new fields to each |Keypoint| instance:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    keypoint = fo.Keypoint(
        label="rectangle",
        points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
        kind="square",  # custom attribute
    )

    print(keypoint)

.. code-block:: text

    <Keypoint: {
        'id': '60f74723467d81f41c200556',
        'attributes': BaseDict({}),
        'tags': BaseList([]),
        'label': 'rectangle',
        'points': BaseList([(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)]),
        'confidence': None,
        'index': None,
        'kind': 'square',
    }>

You can also use :ref:`label attributes <label-attributes>` to store custom
attributes with additional metadata such as prediction confidences.

.. note::

    Did you know? You can view custom attributes in the
    :ref:`App tooltip <app-sample-view>` by hovering over the objects.

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

.. note::

    Did you know? You can :ref:`store semantic labels <storing-mask-targets>`
    for your segmentation fields on your dataset. Then, when you view the
    dataset in the App, label strings will appear in the App's tooltip when you
    hover over pixels.

.. _temporal-detection:

Temporal detection
------------------

The |TemporalDetection| class represents an event occuring during a specified
range of frames in a video.

The :attr:`label <fiftyone.core.labels.TemporalDetection.label>` attribute
stores the detection label, and the
:attr:`support <fiftyone.core.labels.TemporalDetection.support>` attribute
stores the `[first, last]` frame range of the detection in the video.

The optional
:attr:`confidence <fiftyone.core.labels.TemporalDetection.confidence>`
attribute can be used to store a model prediction score, and you can add
:ref:`custom attributes <label-attributes>` as well, which can be visualized in
the App.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/video.mp4")
    sample["events"] = fo.TemporalDetection(label="meeting", support=[10, 20])

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'video',
        'filepath': '/path/to/video.mp4',
        'tags': [],
        'metadata': None,
        'events': <TemporalDetection: {
            'id': '61321c8ea36cb17df655f44f',
            'tags': BaseList([]),
            'label': 'meeting',
            'support': BaseList([10, 20]),
            'confidence': None,
        }>,
        'frames': <Frames: 0>,
    }>

If your temporal detection data is represented as timestamps in seconds, you
can use the
:meth:`from_timestamps() <fiftyone.core.labels.TemporalDetection.from_timestamps>`
factory method to perform the necessary conversion to frames automatically
based on the sample's :ref:`video metadata <using-metadata>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Download a video to work with
    dataset = foz.load_zoo_dataset("quickstart-video", max_samples=1)
    filepath = dataset.first().filepath

    sample = fo.Sample(filepath=filepath)
    sample.compute_metadata()

    sample["events"] = fo.TemporalDetection.from_timestamps(
        [1, 2], label="meeting", sample=sample
    )

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'video',
        'filepath': '~/fiftyone/quickstart-video/data/Ulcb3AjxM5g_053-1.mp4',
        'tags': [],
        'metadata': <VideoMetadata: {
            'size_bytes': 1758809,
            'mime_type': 'video/mp4',
            'frame_width': 1920,
            'frame_height': 1080,
            'frame_rate': 29.97002997002997,
            'total_frame_count': 120,
            'duration': 4.004,
            'encoding_str': 'avc1',
        }>,
        'events': <TemporalDetection: {
            'id': '61321e498d5f587970b29183',
            'tags': BaseList([]),
            'label': 'meeting',
            'support': BaseList([31, 60]),
            'confidence': None,
        }>,
        'frames': <Frames: 0>,
    }>

The |TemporalDetections| class holds a list of temporal detections for a
sample:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/video.mp4")
    sample["events"] = fo.TemporalDetections(
        detections=[
            fo.TemporalDetection(label="meeting", support=[10, 20]),
            fo.TemporalDetection(label="party", support=[30, 60]),
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
        'events': <TemporalDetections: {
            'detections': BaseList([
                <TemporalDetection: {
                    'id': '61321ed78d5f587970b29184',
                    'tags': BaseList([]),
                    'label': 'meeting',
                    'support': BaseList([10, 20]),
                    'confidence': None,
                }>,
                <TemporalDetection: {
                    'id': '61321ed78d5f587970b29185',
                    'tags': BaseList([]),
                    'label': 'party',
                    'support': BaseList([30, 60]),
                    'confidence': None,
                }>,
            ]),
        }>,
        'frames': <Frames: 0>,
    }>

.. note::

    Did you know? You can :ref:`store class lists <storing-classes>` for your
    models on your datasets.

.. _geolocation:

Geolocation
-----------

The |GeoLocation| class can store single pieces of location data in its
properties:

-   :attr:`point <fiftyone.core.labels.GeoLocation.point>`: a
    ``[longitude, latitude]`` point
-   :attr:`line <fiftyone.core.labels.GeoLocation.line>`: a line of longitude
    and latitude coordinates stored in the following format::

        [[lon1, lat1], [lon2, lat2], ...]

-   :attr:`polygon <fiftyone.core.labels.GeoLocation.polygon>`: a polygon of
    longitude and latitude coordinates stored in the format below, where the
    first element describes the boundary of the polygon and any remaining
    entries describe holes::

        [
            [[lon1, lat1], [lon2, lat2], ...],
            [[lon1, lat1], [lon2, lat2], ...],
            ...
        ]

.. note::

    All geolocation coordinates are stored in ``[longitude, latitude]``
    format.

If you have multiple geometries of each type that you wish to store on a single
sample, then you can use the |GeoLocations| class and its appropriate
properites to do so.

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/image.png")

    sample["location"] = fo.GeoLocation(
        point=[-73.9855, 40.7580],
        polygon=[
            [
                [-73.949701, 40.834487],
                [-73.896611, 40.815076],
                [-73.998083, 40.696534],
                [-74.031751, 40.715273],
                [-73.949701, 40.834487],
            ]
        ],
    )

    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'image',
        'filepath': '/path/to/image.png',
        'tags': [],
        'metadata': None,
        'location': <GeoLocation: {
            'id': '60481f3936dc48428091e926',
            'tags': BaseList([]),
            'point': [-73.9855, 40.758],
            'line': None,
            'polygon': [
                [
                    [-73.949701, 40.834487],
                    [-73.896611, 40.815076],
                    [-73.998083, 40.696534],
                    [-74.031751, 40.715273],
                    [-73.949701, 40.834487],
                ],
            ],
        }>,
    }>

.. note::

    Did you know? You can create
    :ref:`location-based views <geolocation-views>` that filter your data by
    their location!

All location data is stored in
`GeoJSON format <https://en.wikipedia.org/wiki/GeoJSON>`_ in the database. You
can easily retrieve the raw GeoJSON data for a slice of your dataset using the
:ref:`values() <aggregations-values>` aggregation:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-geo")

    values = dataset.take(5).values("location.point", _raw=True)
    print(values)

.. code-block:: text

    [{'type': 'Point', 'coordinates': [-73.9592175465766, 40.71052995514191]},
     {'type': 'Point', 'coordinates': [-73.97748118760413, 40.74660360881843]},
     {'type': 'Point', 'coordinates': [-73.9508690871987, 40.766631164626]},
     {'type': 'Point', 'coordinates': [-73.96569416502996, 40.75449283200206]},
     {'type': 'Point', 'coordinates': [-73.97397106211423, 40.67925541341504]}]

.. _label-tags:

Label tags
----------

All |Label| instances have a `tags` field, which is a string list. By default,
this list is empty, but you can use it to store application-specific
information like whether the label is incorrect:

.. code-block:: python
    :linenos:

    detection = fo.Detection(label="cat", bounding_box=[0, 0, 1, 1])

    detection.tags.append("mistake")

    print(detection.tags)
    # ["mistake"]

.. note::

    Did you know? You can add, edit, and filter by label tags
    :ref:`directly in the App <app-tagging>`.

.. _label-attributes:

Label attributes
----------------

The |Detection|, |Polyline|, and |Keypoint| label types have an optional
:attr:`attributes <fiftyone.core.labels.Detection.attributes>` field that you
can use to store custom attributes on the object.

The :attr:`attributes <fiftyone.core.labels.Detection.attributes>` field is a
dictionary mapping attribute names to |Attribute| instances, which contain the
:attr:`value <fiftyone.core.labels.Attribute.value>` of the attribute and any
associated metadata.

.. note::

    In most cases, it is recommended to :ref:`add custom attributes as fields
    directly on<using-labels>` the |Label| object. However, a typical use case
    for this feature, as opposed to simply storing custom attributes directly
    on the |Label| object, is to store predictions and associated
    confidences of a classifier applied to the object patches.

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
    | :class:`ListAttribute <fiftyone.core.labels.ListAttribute>`               | `list`     | A list attribute                |
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
                    'id': '60f738e7467d81f41c20054c',
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51}>,
                        'mood': <CategoricalAttribute: {
                            'value': 'salty', 'confidence': None, 'logits': None
                        }>,
                    }),
                    'tags': BaseList([]),
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
                    'id': '60f738e7467d81f41c20054d',
                    'attributes': BaseDict({
                        'age': <NumericAttribute: {'value': 51}>,
                        'mood': <CategoricalAttribute: {
                            'value': 'surly', 'confidence': 0.95, 'logits': None
                        }>,
                    }),
                    'tags': BaseList([]),
                    'label': 'cat',
                    'bounding_box': BaseList([0.48, 0.513, 0.397, 0.288]),
                    'mask': None,
                    'confidence': 0.96,
                    'index': None,
                }>,
            ]),
        }>,
    }>

.. note::

    Did you know? You can view attribute values in the
    :ref:`App tooltip <app-sample-view>` by hovering over the objects.

.. _video-frame-labels:

Video frame labels
__________________

When you create a video sample, i.e., a |Sample| with `media_type == 'video'`,
it is given a reserved `frames` attribute in which you can store frame-level
labels and other custom annotations for the video.

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
        'frames': <Frames: 0>,
    }>

The `frames` attribute of a video sample is a dictionary whose keys are frame
numbers and whose values are |Frame| instances that hold all of the |Label|
instances and other primitive-type fields for the frame.

.. note::

    FiftyOne uses 1-based indexing for video frame numbers.

You can add, modify, and delete :ref:`labels of any type <using-labels>` as
well as primitive fields such as integers, strings, and booleans using the same
dynamic attribute syntax that you use to
:ref:`interact with samples <adding-sample-fields>`:

.. code:: python
    :linenos:

    # Add labels to first frame of a video sample

    frame = sample.frames[1]

    frame["quality"] = 97.12

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
        'frames': <Frames: 1>,    <-- `frames` now contains 1 frame of labels
    }>

.. note::

    The `frames` attribute of video samples behaves like a defaultdict; a new
    |Frame| will be created if the frame number does not exist when you access
    it.

You can iterate over the frames in a video sample using the expected syntax:

.. code:: python
    :linenos:

    for frame_number, frame in sample.frames.items():
        print(frame)

.. code-block:: text

    <Frame: {
        'id': None,
        'frame_number': 1,
        'quality': 97.12,
        'weather': <Classification: {
            'id': '609078d54653b0094e9baa52',
            'tags': BaseList([]),
            'label': 'sunny',
            'confidence': None,
            'logits': None,
        }>,
        'objects': <Detections: {
            'detections': BaseList([
                <Detection: {
                    'id': '609078d54653b0094e9baa53',
                    'attributes': BaseDict({}),
                    'tags': BaseList([]),
                    'label': 'cat',
                    'bounding_box': BaseList([0.1, 0.1, 0.2, 0.2]),
                    'mask': None,
                    'confidence': None,
                    'index': None,
                }>,
                <Detection: {
                    'id': '609078d54653b0094e9baa54',
                    'attributes': BaseDict({}),
                    'tags': BaseList([]),
                    'label': 'dog',
                    'bounding_box': BaseList([0.7, 0.7, 0.2, 0.2]),
                    'mask': None,
                    'confidence': None,
                    'index': None,
                }>,
            ]),
        }>,
    }>

Video samples can be added to datasets just like image samples:

.. code:: python
    :linenos:

    dataset = fo.Dataset()
    dataset.add_sample(sample)

    print(dataset)

.. code-block:: text

    Name:           2021.05.03.18.30.20
    Media type:     video
    Num samples:    1
    Persistent:     False
    Tags:           []
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
    Frame fields:
        id:           fiftyone.core.fields.ObjectIdField
        frame_number: fiftyone.core.fields.FrameNumberField
        quality:      fiftyone.core.fields.FloatField
        weather:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Classification)
        objects:      fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)

Notice that the dataset's summary indicates that the dataset has media type
`video` and includes the schema of the frame fields.

You can retrieve detailed information about the schema of the frames of a
video |Dataset| using
:meth:`dataset.get_frame_field_schema() <fiftyone.core.dataset.Dataset.get_frame_field_schema>`.

The samples in video datasets can be accessed
:ref:`like usual <accessing-samples-in-a-dataset>`, and the sample's frame
labels can be modified by updating the `frames` attribute of a |Sample|:

.. code:: python
    :linenos:

    sample = dataset.first()
    for frame_number, frame in sample.frames.items():
        frame["frame_str"] = str(frame_number)
        del frame["weather"]
        del frame["objects"]

    sample.save()

    print(sample.frames[1])

.. code-block:: text

    <Frame: {
        'id': '6090797c4653b0094e9baa57',
        'frame_number': 1,
        'quality': 97.12,
        'weather': None,
        'objects': None,
        'frame_str': '1',
    }>

.. note::

    You must call :meth:`sample.save() <fiftyone.core.sample.Sample.save>` in
    order to persist changes to the database when editing video samples and/or
    their frames that are in datasets.

:ref:`See this page <loading-custom-datasets>` for more information about
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
|Sample| in the dataset. For example, a |SampleView| may represent the contents
of a sample with |Detections| below a specified threshold filtered out.

.. custombutton::
    :button_text: Learn more about DatasetViews
    :button_link: using_views.html

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")
    dataset.compute_metadata()

    # Create a view containing the 5 samples from the validation split whose
    # images are >= 48 KB that have the most predictions with confidence > 0.9
    complex_view = (
        dataset
        .match_tags("validation")
        .match(F("metadata.size_bytes") >= 48 * 1024)  # >= 48 KB
        .filter_labels("predictions", F("confidence") > 0.9)
        .sort_by(F("predictions.detections").length(), reverse=True)
        .limit(5)
    )

    # Check to see how many predictions there are in each matching sample
    print(complex_view.values(F("predictions.detections").length()))
    # [29, 20, 17, 15, 15]

.. _merging-datasets:

Merging datasets
________________

The |Dataset| class provides a powerful
:meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` method
that you can use to merge the contents of another |Dataset| or |DatasetView|
into an existing dataset.

By default, samples with the same absolute `filepath` are merged, and top-level
fields from the provided samples are merged in, overwriting any existing values
for those fields, with the exception of list fields (e.g.,
:ref:`tags <using-tags>`) and label list fields (e.g.,
:ref:`Detections <object-detection>`), in which case the elements of the lists
themselves are merged. In the case of label list fields, labels with the same
`id` in both collections are updated rather than duplicated.

The :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>`
method can be configured in numerous ways, including:

-   Which field to use as a merge key, or an arbitrary function defining the
    merge key
-   Whether existing samples should be modified or skipped
-   Whether new samples should be added or omitted
-   Whether new fields can be added to the dataset schema
-   Whether list fields should be treated as ordinary fields and merged as a
    whole rather than merging their elements
-   Whether to merge only specific fields, or all but certain fields
-   Mapping input fields to different field names of this dataset

For example, the following snippet demonstrates merging a new field into an
existing dataset:

.. code:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset1 = foz.load_zoo_dataset("quickstart")

    # Create a dataset containing only ground truth objects
    dataset2 = dataset1.select_fields("ground_truth").clone()

    # Create a view containing only the predictions
    predictions_view = dataset1.select_fields("predictions")

    # Merge the predictions
    dataset2.merge_samples(predictions_view)

    print(dataset1.count("ground_truth.detections"))  # 1232
    print(dataset2.count("ground_truth.detections"))  # 1232

    print(dataset1.count("predictions.detections"))  # 5620
    print(dataset2.count("predictions.detections"))  # 5620

Note that the argument to
:meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` can be a
|DatasetView|, which means that you can perform possibly-complex
:ref:`transformations <using-views>` to the source dataset to select the
desired content to merge.

Consider the following variation of the above snippet, which demonstrates a
workflow where |Detections| from another dataset are merged into a dataset with
existing |Detections| in the same field:

.. code:: python
    :linenos:

    from fiftyone import ViewField as F

    # Create a new dataset that only contains predictions with confidence >= 0.9
    dataset3 = (
        dataset1
        .select_fields("predictions")
        .filter_labels("predictions", F("confidence") > 0.9)
    ).clone()

    # Create a view that contains only the remaining predictions
    low_conf_view = dataset1.filter_labels("predictions", F("confidence") < 0.9)

    # Merge the low confidence predictions back in
    dataset3.merge_samples(low_conf_view, fields="predictions")

    print(dataset1.count("predictions.detections"))  # 5620
    print(dataset3.count("predictions.detections"))  # 5620

Finally, the example below demonstrates the use of a custom merge key to define
which samples to merge:

.. code:: python
    :linenos:

    import os

    # Create a dataset with 100 samples of ground truth labels
    dataset4 = dataset1[50:150].select_fields("ground_truth").clone()

    # Create a view with 50 overlapping samples of predictions
    predictions_view = dataset1[:100].select_fields("predictions")

    # Merge predictions into dataset, using base filename as merge key and
    # never inserting new samples
    dataset4.merge_samples(
        predictions_view,
        key_fcn=lambda sample: os.path.basename(sample.filepath),
        insert_new=False,
    )

    print(len(dataset4))  # 100
    print(len(dataset4.exists("predictions")))  # 50

.. note::

    Did you know? You can use
    :meth:`merge_dir() <fiftyone.core.dataset.Dataset.merge_dir>` to directly
    merge the contents of a dataset on disk into an existing FiftyOne
    dataset without first
    :ref:`loading it <loading-datasets-from-disk>` into a temporary dataset and
    then using
    :meth:`merge_samples() <fiftyone.core.dataset.Dataset.merge_samples>` to
    perform the merge.

.. _batch-updates:

Batch updates
_____________

You are always free to perform any necessary modifications to a |Dataset| by
iterating over it via a Python loop and explicitly
:ref:`performing the edits <editing-sample-fields>` that you require.

However, the |Dataset| class provides a number of methods that allow you to
efficiently perform various common batch actions to your entire dataset.

.. _clone-rename-clear-delete:

Cloning, renaming, clearing, and deleting fields
------------------------------------------------

You can use the
:meth:`clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`,
:meth:`rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>`,
:meth:`clear_sample_field() <fiftyone.core.dataset.Dataset.clear_sample_field>`,
and
:meth:`delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`
methods to efficiently perform common actions on the sample fields of a
|Dataset|:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    # Clone an existing field
    dataset.clone_sample_field("predictions", "also_predictions")
    print("also_predictions" in dataset.get_field_schema())  # True

    # Rename a field
    dataset.rename_sample_field("also_predictions", "still_predictions")
    print("still_predictions" in dataset.get_field_schema())  # True

    # Clear a field (sets all values to None)
    dataset.clear_sample_field("still_predictions")
    print(dataset.count_values("still_predictions"))  # {None: 200}

    # Delete a field
    dataset.delete_sample_field("still_predictions")

You can also use
`dot notation <https://docs.mongodb.com/manual/core/document/#dot-notation>`_
to manipulate the fields or subfields of embedded documents in your dataset:

.. code-block:: python
    :linenos:

    sample = dataset.first()

    # Clone an existing embedded field
    dataset.clone_sample_field(
        "predictions.detections.label",
        "predictions.detections.also_label",
    )
    print(sample.predictions.detections[0]["also_label"])  # "bird"

    # Rename an embedded field
    dataset.rename_sample_field(
        "predictions.detections.also_label",
        "predictions.detections.still_label",
    )
    print(sample.predictions.detections[0]["still_label"])  # "bird"

    # Clear an embedded field (sets all values to None)
    dataset.clear_sample_field("predictions.detections.still_label")
    print(sample.predictions.detections[0]["still_label"])  # None

    # Delete an embedded field
    dataset.delete_sample_field("predictions.detections.still_label")

.. _efficient-batch-edits:

Efficient batch edits
---------------------

You are always free to perform arbitrary edits to a |Dataset| by iterating over
its contents and editing the samples directly:

.. code-block:: python
    :linenos:

    import random

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart")

    # Populate a new field on each sample in the dataset
    for sample in dataset:
        sample["random"] = random.random()
        sample.save()

    print(dataset.count("random"))  # 200
    print(dataset.bounds("random")) # (0.0007, 0.9987)

Alternatively, you can use
:meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>` to
set a field (or embedded field) on each sample in the dataset in a single
batch operation:

.. code-block:: python
    :linenos:

    # Delete the field we added in the previous variation
    dataset.delete_sample_field("random")

    # Equivalent way to populate a new field on each sample in a view
    values = [random.random() for _ in range(len(dataset))]
    dataset.set_values("random", values)

    print(dataset.count("random"))  # 50
    print(dataset.bounds("random")) # (0.0041, 0.9973)

.. note::

    When possible, using
    :meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
    is often more efficient than performing the equivalent operation via an
    explicit iteration over the |Dataset| because it avoids the need to read
    the entire |Sample| instances into memory and then save them.

Similarly, you can edit nested sample fields of a |Dataset| by iterating over
the dataset and editing the necessary data:

.. code-block:: python
    :linenos:

    # Add a tag to all low confidence predictions in the dataset
    for sample in dataset:
        for detection in sample["predictions"].detections:
            if detection.confidence < 0.06:
                detection.tags.append("low_confidence")

        sample.save()

    print(dataset.count_label_tags())
    # {'low_confidence': 447}

However, an equivalent and often more efficient approach is to use
:meth:`values() <fiftyone.core.collections.SampleCollection.values>` to
extract the slice of data you wish to modify and then use
:meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>` to
save the updated data in a single batch operation:

.. code-block:: python
    :linenos:

    # Remove the tags we added in the previous variation
    dataset.untag_labels("low_confidence")

    # Load all predicted detections
    # This is a list of lists of `Detection` instances for each sample
    detections = dataset.values("predictions.detections")

    # Add a tag to all low confidence detections
    for sample_detections in detections:
        for detection in sample_detections:
            if detection.confidence < 0.06:
                detection.tags.append("low_confidence")

    # Save the updated predictions
    dataset.set_values("predictions.detections", detections)

    print(dataset.count_label_tags())
    # {'low_confidence': 447}
