.. _groups:

Grouped datasets
================

.. default-role:: code

FiftyOne supports the creation of **grouped datasets**, which contain samples
of possibly different modalities (image, video, or point cloud) that are
organized into groups of related samples.

Grouped datasets can be used, for example, to represent multiview scenes, where
data for multiple perspectives of the same scene can be stored, visualized, and
queried in ways that respect the relationships between the slices of data.

.. _groups-overview:

Overview
________

In this section, we'll cover the basics of creating and working with grouped
datasets via Python.

Let's start by creating some test data. We'll use the quickstart dataset to
construct some mocked triples of left/center/right images:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.splits as fous
    import fiftyone.zoo as foz

    groups = ["left", "center", "right"]

    d = foz.load_zoo_dataset("quickstart")
    fous.random_split(d, {g: 1 / len(groups) for g in groups})
    filepaths = [d.match_tags(g).values("filepath") for g in groups]
    filepaths = [dict(zip(groups, fps)) for fps in zip(*filepaths)]

    print(filepaths[:2])

.. code-block:: text

    [
        {
            'left': '~/fiftyone/quickstart/data/000880.jpg',
            'center': '~/fiftyone/quickstart/data/002799.jpg',
            'right': '~/fiftyone/quickstart/data/001599.jpg',
        },
        {
            'left': '~/fiftyone/quickstart/data/003344.jpg',
            'center': '~/fiftyone/quickstart/data/001057.jpg',
            'right': '~/fiftyone/quickstart/data/001430.jpg',
        },
    ]

.. _groups-creation:

Creating grouped datasets
-------------------------

To create a grouped dataset, simply use
:meth:`add_group_field() <fiftyone.core.dataset.Dataset.add_group_field>` to
declare a |GroupField| on your dataset before you add samples to it:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset()
    dataset.add_group_field("group", default="center")

The optional `default` parameter specifies the slice of samples that will be
returned via the API or visualized in the App's grid view by default.

.. note::

    Datasets may only contain one |GroupField|.

.. _groups-adding-samples:

Adding samples
--------------

To populate a grouped dataset with samples, create a single |Group| instance
for each group of samples and use
:meth:`Group.element() <fiftyone.core.groups.Group.element>` to generate values
for the `group_field` of each |Sample| object in the group based on their
slice's `name`. The |Sample| objects can then simply be added to the dataset as
usual:

.. code-block:: python
    :linenos:

    samples = []
    for fps in filepaths:
        group = fo.Group()
        for name, filepath in fps.items():
            sample = fo.Sample(filepath=filepath, group=group.element(name))
            samples.append(sample)

    dataset.add_samples(samples)

    print(dataset)

.. code-block:: text

    Name:        2022.08.08.09.19.06
    Media type:  group
    Group slice: center
    Num groups:  66
    Persistent:  False
    Tags:        []
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)

.. note::

    Every sample in a grouped dataset must have it's `group_field` populated
    with a `Group` element.

.. _groups-dataset-properties:

Dataset properties
------------------

Grouped datasets have a `media_type` of `"group"`:

.. code-block:: python
    :linenos:

    print(dataset.media_type)
    # group

The :meth:`group_field <fiftyone.core.dataset.Dataset.group_field>` property
contains the name of the |GroupField| storing the dataset's group membership
information:

.. code-block:: python
    :linenos:

    print(dataset.group_field)
    # group

The :meth:`group_slices <fiftyone.core.dataset.Dataset.group_slices>` property
contains the names of all group slices in the dataset:

.. code-block:: python
    :linenos:

    print(dataset.group_slices)
    # ['left', 'center', 'right']

The :meth:`group_media_types <fiftyone.core.dataset.Dataset.group_media_types>`
property is a dict mapping each slice name to its corresponding media type:

.. code-block:: python
    :linenos:

    print(dataset.group_media_types)
    # {'left': 'image', 'center': 'image', 'right': 'image'}

The list of group slices and their corresponding media types are dynamically
expanded as you add samples to a grouped dataset.

.. note::

    Grouped datasets may contain a mix of images, videos, and point clouds, but
    FiftyOne strictly enforces that each **slice** of a grouped dataset must
    have a homogeneous media type.

    For example, you would see an error if you tried to add a video sample to
    the `left` slice of the above dataset, since it contains images.

The :meth:`default_group_slice <fiftyone.core.dataset.Dataset.default_group_slice>`
property stores the name of the default group slice:

.. code-block:: python
    :linenos:

    print(dataset.default_group_slice)
    # center

The default group slice controls the slice of samples that will be returned via
the API---for example when you directly iterate over the dataset---or
visualized in the App's grid view by default:

.. code-block:: python
    :linenos:

    print(dataset.first())

.. code-block:: text

    <Sample: {
        'id': '62db2ce147e9efc3615cd450',
        'media_type': 'image',
        'filepath': '~/fiftyone/quickstart/data/003344.jpg',
        'tags': BaseList([]),
        'metadata': None,
        'group': <Group: {'id': '62db2ce147e9efc3615cd346', 'name': 'center'}>,
    }>

You can change the *active group slice* in your current session by setting the
:meth:`group_slice <fiftyone.core.dataset.Dataset.group_slice>` property:

.. code-block:: python
    :linenos:

    dataset.group_slice = "left"

    print(dataset.first())

.. code-block:: text

    <Sample: {
        'id': '62db2ce147e9efc3615cd44e',
        'media_type': 'image',
        'filepath': '~/fiftyone/quickstart/data/001599.jpg',
        'tags': BaseList([]),
        'metadata': None,
        'group': <Group: {'id': '62db2ce147e9efc3615cd346', 'name': 'left'}>,
    }>

You can reset the active group slice to the default value by setting
:meth:`group_slice <fiftyone.core.dataset.Dataset.group_slice>` to `None`:

.. code-block:: python
    :linenos:

    # Resets to `default_group_slice`
    dataset.group_slice = None

.. _groups-adding-fields:

Adding fields
-------------

You are free to add arbitrary sample- and frame-level fields to your grouped
datasets just as you would with ungrouped datasets:

.. code-block:: python
    :linenos:

    sample = dataset.first()

    sample["int_field"] = 51
    sample["ground_truth"] = fo.Classification(label="outdoor")

    sample.save()

You can also use methods like
:meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`
and :meth:`save() <fiftyone.core.view.DatasetView.save>` to perform bulk
edits to the *active slice* of a grouped dataset.

Note that all slices of a grouped dataset share the same schema, and hence
any fields you add to samples from a particular slice will be implicitly
declared on all samples from that slice *and* all other slices:

.. code-block:: python
    :linenos:

    print(dataset)

.. code-block:: text

    Name:        2022.08.08.09.19.06
    Media type:  group
    Group slice: center
    Num groups:  66
    Persistent:  False
    Tags:        []
    Sample fields:
        id:           fiftyone.core.fields.ObjectIdField
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:        fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
        int_field:    fiftyone.core.fields.IntField
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Classification)

.. note::

    Like ungrouped datasets, any fields in a grouped dataset's schema that have
    not been explicitly set on a |Sample| in the dataset will be `None`.

Like ungrouped datasets, you can use methods like
:meth:`clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`,
:meth:`rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>`,
:meth:`delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`,
:meth:`clear_sample_field() <fiftyone.core.dataset.Dataset.clear_sample_field>`,
and :meth:`keep_fields() <fiftyone.core.view.DatasetView.keep_fields>` to
perform batch edits to the fields across *all slices* of a grouped dataset.

.. _groups-accessing-samples:

Accessing samples
-----------------

Like ungrouped datasets, you can access a sample from any slice of grouped
dataset via its ID or filepath:

.. code-block:: python
    :linenos:

    # Grab a random sample across all slices
    sample = dataset.select_group_slice().shuffle().first()

    also_sample = dataset[sample_id]

    assert also_sample is sample

In addition, you can also use
:meth:`get_group() <fiftyone.core.dataset.Dataset.get_group>` to retrieve a
dict containing all samples in a group with a given ID:

.. code-block:: python
    :linenos:

    # Grab a random group ID
    sample = dataset.shuffle().first()
    group_id = sample.group.id

    group = dataset.get_group(group_id)
    print(group)

.. _groups-deleting-samples:

Deleting samples
----------------

Like ungrouped datasets, you can use
:meth:`delete_samples() <fiftyone.core.dataset.Dataset.delete_samples>` to
delete individual sample(s) from a grouped dataset:

.. code-block:: python
    :linenos:

    # Grab a random sample across all slices
    sample = dataset.select_group_slice().shuffle().first()

    dataset.delete_samples(sample)

In addition, you can use
:meth:`delete_groups() <fiftyone.core.dataset.Dataset.delete_groups>` to delete
all samples in a specific group(s):

.. code-block:: python
    :linenos:

    # Continuing from above, delete the rest of the group
    group_id = sample.group.id

    dataset.delete_groups(group_id)

You can also use methods like
:meth:`clear() <fiftyone.core.view.DatasetView.clear>` and
:meth:`keep() <fiftyone.core.view.DatasetView.keep>` to perform batch edits to
the groups in a grouped dataset.

.. _groups-iteration:

Iterating over grouped datasets
-------------------------------

When you directly iterate over a grouped dataset, you will get samples from the
dataset's *active slice*:

.. code-block:: python
    :linenos:

    print(dataset.group_slice)
    # center

    for sample in dataset:
        pass

    print(sample)

.. code-block:: text

    <Sample: {
        'id': '62f10dbb68f4ed13eba7c5e7',
        'media_type': 'image',
        'filepath': '/Users/Brian/fiftyone/quickstart/data/001394.jpg',
        'tags': BaseList([]),
        'metadata': None,
        'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'center'}>,
    }>

.. note::

    You can customize the dataset's active slice by setting the
    :meth:`group_slice <fiftyone.core.dataset.Dataset.group_slice>` property to
    another slice name.

You can also use
:meth:`iter_groups() <fiftyone.core.dataset.Dataset.iter_groups>` to iterate
over dicts containing all samples in each group:

.. code-block:: python
    :linenos:

    for group in dataset.iter_groups():
        pass

    print(group)

.. code-block:: text

    {
        'left': <Sample: {
            'id': '62f10dbb68f4ed13eba7c5e6',
            'media_type': 'image',
            'filepath': '/Users/Brian/fiftyone/quickstart/data/002538.jpg',
            'tags': BaseList([]),
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'left'}>,
        }>,
        'center': <Sample: {
            'id': '62f10dbb68f4ed13eba7c5e7',
            'media_type': 'image',
            'filepath': '/Users/Brian/fiftyone/quickstart/data/001394.jpg',
            'tags': BaseList([]),
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'center'}>,
        }>,
        'right': <Sample: {
            'id': '62f10dbb68f4ed13eba7c5e8',
            'media_type': 'image',
            'filepath': '/Users/Brian/fiftyone/quickstart/data/000020.jpg',
            'tags': BaseList([]),
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'right'}>,
        }>,
    }

.. _groups-example-datasets:

Example grouped datasets
________________________

The :ref:`FiftyOne Dataset Zoo <dataset-zoo>` contains grouped datasets that
you can use out-of-the-box to test drive FiftyOne's group-related features.

The fastest way to get started is by loading the
:ref:`quickstart-groups <dataset-zoo-quickstart-groups>` dataset, which
consists of 200 scenes (groups) from the train split of the KITTI dataset, each
containing left camera, right camera, point cloud, and 2D/3D object annotation
data:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-groups")

    print(dataset.group_media_types)
    # {'left': 'image', 'right': 'image', 'pcd': 'point-cloud'}

    print(dataset)

.. code-block:: text

    Name:        quickstart-groups
    Media type:  group
    Group slice: left
    Num groups:  200
    Persistent:  False
    Tags:        []
    Sample fields:
        id:           fiftyone.core.fields.ObjectIdField
        filepath:     fiftyone.core.fields.StringField
        tags:         fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata:     fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:        fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
        ground_truth: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.labels.Detections)

You can also load the full :ref:`kitti-multiview <dataset-zoo-kitti-multiview>`
dataset:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("kitti-multiview", split="train")

.. _groups-views:

Views into grouped datasets
___________________________

You have the entire :ref:`dataset view language <using-views>` at your disposal
to sort, slice, and search your grouped datasets!

.. _groups-basic-views:

Basics
------

You can perform simple operations like shuffling and limiting grouped datasets:

.. code-block:: python
    :linenos:

    # Select 10 random groups from the dataset
    view = dataset.shuffle().limit(10)

    print(view)

.. code-block:: text

    Dataset:     2022.08.08.09.19.06
    Media type:  group
    Group slice: center
    Num groups:  10
    Group fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. Shuffle(seed=None)
        2. Limit(limit=10)

As you can see, the :ref:`basic properties <groups-dataset-properties>` of
grouped datasets carry over to views into them:

.. code-block:: python
    :linenos:

    print(view.media_type)
    # group

    print(view.group_slice)
    # center

    print(view.group_media_types)
    # {'left': 'image', 'center': 'image', 'right': 'image'}

You can also perform all the usual operations on grouped views, such as
:ref:`accessing samples <groups-accessing-samples>`, and
:ref:`iterating over them <groups-iteration>`:

.. code-block:: python
    :linenos:

    for group in view.iter_groups():
        pass

    sample = view.last()
    print(sample)

    group_id = sample.group.id
    group = view.get_group(group_id)
    print(group)

.. _groups-filtering:

Filtering
---------

You can write views that :ref:`match and filter <view-filtering>` the contents
of grouped datasets:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    view = (
        dataset
        .match_tags("validation")
        .exists("predictions")
        .filter_labels("predictions", F("confidence") > 0.9)
    )

Remember that, by default, as per when :ref:`iterating over <groups-iteration>`
grouped datasets, any filtering operations will only be applied to the
*active slice* of grouped datasets.

However, you can write views that reference specific slice(s) of a grouped
collection via the special `"groups.<slice>.field.name"` syntax:

.. code-block:: python
    :linenos:

    from fiftyone import ViewField as F

    dataset.compute_metadata()

    # Match groups whose `left` image has a height of at least 640 pixels and
    # whose `right` image has a height of at most 480 pixels
    view = dataset.match(
        (F("groups.left.metadata.height") >= 640)
        & (F("groups.right.metadata.height") <= 480)
    )

    print(view)

.. _groups-selecting-groups:

Selecting groups
----------------

You can use
:meth:`select_groups() <fiftyone.core.collections.SampleCollection.select_groups>`
to create a view that contains certain group(s) of interest by their IDs:

.. code-block:: python
    :linenos:

    # Select two groups at random
    view = dataset.take(2)

    group_ids = view.values("group.id")

    # Select the same groups (default: unordered)
    same_groups = dataset.select_groups(group_ids)
    assert set(view.values("id")) == set(same_groups.values("id"))

    # Select the same groups (ordered)
    same_order = dataset.select_groups(group_ids, ordered=True)
    assert view.values("id") == same_order.values("id")

.. _groups-selecting-slices:

Selecting slices
----------------

You can use
:meth:`select_group_slice() <fiftyone.core.collections.SampleCollection.select_group_slice>`
to create *non-grouped views* that contain one or more slices of data from a
grouped dataset.

For example, you can create an image view that contains only the left camera
images from the grouped dataset:

.. code-block:: python
    :linenos:

    left_view = dataset.select_group_slice("left")
    print(left_view)

.. code-block:: text

    Dataset:     2022.08.08.09.19.06
    Media type:  image
    Num samples: 108
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. SelectGroupSlice(slice='left')

or you could create an image collection containing the left and right camera
images:

.. code-block:: python
    :linenos:

    lr_view = dataset.select_group_slice(["left", "right"])
    print(lr_view)

.. code-block:: text

    Dataset:     2022.08.09.01.04.34
    Media type:  image
    Num samples: 216
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. SelectGroupSlice(slice=['left', 'right'])

Note that the :meth:`media_type <fiftyone.core.view.DatasetView.media_type` of
the above collections are `image`, not `group`. This means you can perform any
valid operation for image collections to these views, without worrying about
the fact that their data is sourced from a grouped dataset!

.. code-block:: python
    :linenos:

    image_view = dataset.shuffle().limit(10).select_group_slice("left")

    another_view = image_view.match(F("metadata.width") >= 640)

    # Add fields/tags, run evaluation, export, etc

.. _groups-exporting:

Exporting groups
________________

If you need to export an entire grouped dataset (or a view into it), you can
use :ref:`FiftyOneDataset format <FiftyOneDataset-export>`:

.. code-block:: python
    :linenos:

    view = dataset.shuffle().limit(10)

    view.export(
        export_dir="/tmp/groups",
        dataset_type=fo.types.FiftyOneDataset,
    )

    dataset2 = fo.Dataset.from_dir(
        dataset_dir="/tmp/groups",
        dataset_type=fo.types.FiftyOneDataset,
    )

You can also :ref:`select specific slice(s) <groups-select-slices>` and then
export the resulting ungrouped collection in
:ref:`all the usual ways <exporting-datasets>`:

.. code-block:: python
    :linenos:

    left_view = dataset.shuffle().limit(10).select_group_slice("left")

    left_view.export(
        export_dir="/tmp/groups-left",
        dataset_type=fo.types.ImageDirectory,
    )
