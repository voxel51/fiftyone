.. _groups:

Grouped datasets
================

.. default-role:: code

FiftyOne supports the creation of **grouped datasets**, which contain multiple
slices of samples of possibly different modalities (image, video, or point
cloud) that are organized into groups.

Grouped datasets can be used, for example, to represent multiview scenes, where
data for multiple perspectives of the same scene can be stored, visualized, and
queried in ways that respect the relationships between the slices of data.

.. image:: /images/groups/groups-modal.gif
   :alt: groups-sizzle
   :align: center

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
    import fiftyone.utils.random as four
    import fiftyone.zoo as foz

    groups = ["left", "center", "right"]

    d = foz.load_zoo_dataset("quickstart")
    four.random_split(d, {g: 1 / len(groups) for g in groups})
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
declare a |Group| field on your dataset before you add samples to it:

.. code-block:: python
    :linenos:

    dataset = fo.Dataset("groups-overview")
    dataset.add_group_field("group", default="center")

The optional `default` parameter specifies the slice of samples that will be
returned via the API or visualized in the App's grid view by default. If you
don't specify a default, one will be inferred from the first sample you add to
the dataset.

.. note::

    Datasets may contain only one |Group| field.

.. _groups-adding-samples:

Adding samples
--------------

To populate a grouped dataset with samples, create a single |Group| instance
for each group of samples and use
:meth:`Group.element() <fiftyone.core.groups.Group.element>` to generate values
for the group field of each |Sample| object in the group based on their slice's
`name`. The |Sample| objects can then simply be added to the dataset as usual:

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

    Name:        groups-overview
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

    Every sample in a grouped dataset must have its group field populated with
    a |Group| element.

.. _groups-dataset-properties:

Dataset properties
------------------

Grouped datasets have a `media_type` of `"group"`:

.. code-block:: python
    :linenos:

    print(dataset.media_type)
    # group

The :meth:`group_field <fiftyone.core.dataset.Dataset.group_field>` property
contains the name of the |Group| field storing the dataset's group membership
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
        'tags': [],
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
        'tags': [],
        'metadata': None,
        'group': <Group: {'id': '62db2ce147e9efc3615cd346', 'name': 'left'}>,
    }>

You can reset the active group slice to the default value by setting
:meth:`group_slice <fiftyone.core.dataset.Dataset.group_slice>` to `None`:

.. code-block:: python
    :linenos:

    # Resets to `default_group_slice`
    dataset.group_slice = None

You can also change the default group slice at any time by setting the
:meth:`default_group_slice <fiftyone.core.dataset.Dataset.default_group_slice>`
property.

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
edits to the :ref:`active slice <groups-dataset-properties>` of a grouped
dataset.

Note that all slices of a grouped dataset share the same schema, and hence
any fields you add to samples from a particular slice will be implicitly
declared on all samples from that slice and all other slices:

.. code-block:: python
    :linenos:

    print(dataset)

.. code-block:: text

    Name:        groups-overview
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

You can use methods like
:meth:`clone_sample_field() <fiftyone.core.dataset.Dataset.clone_sample_field>`,
:meth:`rename_sample_field() <fiftyone.core.dataset.Dataset.rename_sample_field>`,
:meth:`delete_sample_field() <fiftyone.core.dataset.Dataset.delete_sample_field>`,
:meth:`clear_sample_field() <fiftyone.core.dataset.Dataset.clear_sample_field>`,
and :meth:`keep_fields() <fiftyone.core.view.DatasetView.keep_fields>` to
perform batch edits to the fields across *all slices* of a grouped dataset.

.. _groups-accessing-samples:

Accessing samples
-----------------

You can access a sample from any slice of grouped dataset via its ID or
filepath:

.. code-block:: python
    :linenos:

    # Grab a random sample across all slices
    sample = dataset.select_group_slices().shuffle().first()

    # Directly lookup same sample by ID
    also_sample = dataset[sample.id]

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

.. code-block:: text

    {
        'left': <Sample: {
            'id': '62f810ba59e644568f229dac',
            'media_type': 'image',
            'filepath': '~/fiftyone/quickstart/data/001227.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f810ba59e644568f229c62', 'name': 'left'}>,
        }>,
        'center': <Sample: {
            'id': '62f810ba59e644568f229dad',
            'media_type': 'image',
            'filepath': '~/fiftyone/quickstart/data/004172.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f810ba59e644568f229c62', 'name': 'center'}>,
        }>,
        'right': <Sample: {
            'id': '62f810ba59e644568f229dae',
            'media_type': 'image',
            'filepath': '~/fiftyone/quickstart/data/000594.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f810ba59e644568f229c62', 'name': 'right'}>,
        }>,
    }

.. _groups-deleting-samples:

Deleting samples
----------------

Like ungrouped datasets, you can use
:meth:`delete_samples() <fiftyone.core.dataset.Dataset.delete_samples>` to
delete individual sample(s) from a grouped dataset:

.. code-block:: python
    :linenos:

    # Grab a random sample across all slices
    sample = dataset.select_group_slices().shuffle().first()

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
dataset's :ref:`active slice <groups-dataset-properties>`:

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
        'filepath': '~/fiftyone/quickstart/data/001394.jpg',
        'tags': [],
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
            'filepath': '~/fiftyone/quickstart/data/002538.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'left'}>,
        }>,
        'center': <Sample: {
            'id': '62f10dbb68f4ed13eba7c5e7',
            'media_type': 'image',
            'filepath': '~/fiftyone/quickstart/data/001394.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'center'}>,
        }>,
        'right': <Sample: {
            'id': '62f10dbb68f4ed13eba7c5e8',
            'media_type': 'image',
            'filepath': '~/fiftyone/quickstart/data/000020.jpg',
            'tags': [],
            'metadata': None,
            'group': <Group: {'id': '62f10dbb68f4ed13eba7c4a0', 'name': 'right'}>,
        }>,
    }

.. _groups-example-datasets:

Example datasets
________________

The :ref:`FiftyOne Dataset Zoo <dataset-zoo>` contains grouped datasets that
you can use out-of-the-box to test drive FiftyOne's group-related features.

The fastest way to get started is by loading the
:ref:`quickstart-groups <dataset-zoo-quickstart-groups>` dataset, which
consists of 200 scenes from the train split of the KITTI dataset, each
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

.. image:: /images/dataset_zoo/kitti-multiview-train.png
   :alt: kitti-multiview-train
   :align: center

.. _groups-point-clouds:

Point cloud slices
__________________

Grouped datasets may contain one or more point cloud slices, which can be
visualized in the App's :ref:`3D visualizer <3d-visualizer>`.

.. _point-cloud-samples:

Point cloud samples
-------------------

Any |Sample| whose `filepath` is a
`PCD file <https://pointclouds.org/documentation/tutorials/pcd_file_format.html>`_
with extension `.pcd` is recognized as a point cloud sample:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    sample = fo.Sample(filepath="/path/to/point-cloud.pcd")
    print(sample)

.. code-block:: text

    <Sample: {
        'id': None,
        'media_type': 'point-cloud',
        'filepath': '/path/to/point-cloud.pcd',
        'tags': [],
        'metadata': None,
    }>

Here's how a typical PCD file is structured:

.. code-block:: python
    :linenos:

    import numpy as np
    import open3d as o3d

    points = [(x1, y1, z1), (x2, y2, z2), ...]
    colors = [(r1, g1, b1), (r2, g2, b2), ...]
    filepath = "/path/for/point-cloud.pcd"

    pcd = o3d.geometry.PointCloud()
    pcd.points = o3d.utility.Vector3dVector(np.asarray(points))
    pcd.colors = o3d.utility.Vector3dVector(np.asarray(colors))

    o3d.io.write_point_cloud(filepath, pcd)

.. note::

    When working with modalities such as LIDAR, intensity data is assumed to be
    encoded in the `r` channel of the `rgb` field of the
    `PCD files <https://pointclouds.org/documentation/tutorials/pcd_file_format.html>`_.

    When coloring by intensity in the App, the intensity values are
    automatically scaled to use the full dynamic range of the colorscale.

As usual, point cloud samples may contain any type and number of custom fields,
including certain visualizable |Label| types as described below.

.. _3d-detections:

3D Detections
-------------

The App's :ref:`3D visualizer <3d-visualizer>` supports rendering 3D object
detections represented as |Detection| instances with their `label`, `location`,
`dimensions`, and `rotation` attributes populated as shown below:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Object label
    label = "vehicle"

    #
    # Object center `[x, y, z]` in scene coordinates
    #
    # Note that, when `useLegacyCoordinates=True` (the default), the y coordinate
    # of location is offset by half of the object's y dimension.
    #
    # Set `useLegacyCoordinates=False` (recommended) to treat location as the
    # true centroid of the object
    #
    location = [0.47, 1.49, 69.44]

    # Object dimensions `[x, y, z]` in scene units
    dimensions = [2.85, 2.63, 12.34]

    # Object rotation `[x, y, z]` around scene axes, in `[-pi, pi]`
    rotation = [0, -1.56, 0]

    # A 3D object detection
    detection = fo.Detection(
        label=label,
        location=location,
        dimensions=dimensions,
        rotation=rotation,
    )

.. _3d-polylines:

3D Polylines
------------

The App's :ref:`3D visualizer <3d-visualizer>` supports rendering 3D polylines
represented as |Polyline| instances with their `label` and `points3d`
attributes populated as shown below:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Object label
    label = "lane"

    # A list of lists of `[x, y, z]` points in scene coordinates describing
    # the vertices of each shape in the polyline
    points3d = [[[-5, -99, -2], [-8, 99, -2]], [[4, -99, -2], [1, 99, -2]]]

    # A set of semantically related 3D polylines
    polyline = fo.Polyline(label=label, points3d=points3d)

.. _groups-views:

Grouped views
_____________

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

    Dataset:     groups-overview
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

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-groups")

    print(dataset.group_slice)
    # left

    # Filters based on the content in the 'left' slice
    view = (
        dataset
        .match_tags("train")
        .filter_labels("ground_truth", F("label") == "Pedestrian")
    )

Remember that, just as when :ref:`iterating over <groups-iteration>` grouped
datasets, any filtering operations will only be applied to the
:ref:`active slice <groups-dataset-properties>`.

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

.. _groups-excluding-groups:

Excluding groups
----------------

You can use
:meth:`exclude_groups() <fiftyone.core.collections.SampleCollection.exclude_groups>`
to create a view that excludes certain group(s) of interest by their IDs:

.. code-block:: python
    :linenos:

    # Exclude two groups at random
    view = dataset.take(2)

    group_ids = view.values("group.id")
    other_groups = dataset.exclude_groups(group_ids)
    assert len(set(group_ids) & set(other_groups.values("group.id"))) == 0

.. _groups-selecting-slices:

Selecting slices
----------------

You can use
:meth:`select_group_slices() <fiftyone.core.collections.SampleCollection.select_group_slices>`
to create *non-grouped views* that contain one or more slices of data from a
grouped dataset.

For example, you can create an image view that contains only the left camera
images from the grouped dataset:

.. code-block:: python
    :linenos:

    left_view = dataset.select_group_slices("left")
    print(left_view)

.. code-block:: text

    Dataset:     groups-overview
    Media type:  image
    Num samples: 108
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. SelectGroupSlices(slices='left')

or you could create an image collection containing the left and right camera
images:

.. code-block:: python
    :linenos:

    lr_view = dataset.select_group_slices(["left", "right"])
    print(lr_view)

.. code-block:: text

    Dataset:     groups-overview
    Media type:  image
    Num samples: 216
    Sample fields:
        id:       fiftyone.core.fields.ObjectIdField
        filepath: fiftyone.core.fields.StringField
        tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
        metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)
        group:    fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.groups.Group)
    View stages:
        1. SelectGroupSlices(slices=['left', 'right'])

Note that the :meth:`media_type <fiftyone.core.view.DatasetView.media_type` of
the above collections are `image`, not `group`. This means you can perform any
valid operation for image collections to these views, without worrying about
the fact that their data is sourced from a grouped dataset!

.. code-block:: python
    :linenos:

    image_view = dataset.shuffle().limit(10).select_group_slices("left")

    another_view = image_view.match(F("metadata.width") >= 640)

    # Add fields/tags, run evaluation, export, etc

.. _groups-aggregations:

Grouped aggregations
____________________

You can use the entire :ref:`aggregations framework <using-aggregations>` to
efficiently compute statistics on grouoped datasets.

Remember that, just as when :ref:`iterating over <groups-iteration>` or
:ref:`writing views <groups-views>` into grouped datasets, aggregations will
only include samples from the :ref:`active slice <groups-dataset-properties>`:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz
    from fiftyone import ViewField as F

    dataset = foz.load_zoo_dataset("quickstart-groups")

    # Expression that computes the area of a bounding box, in pixels
    bbox_width = F("bounding_box")[2] * F("$metadata.width")
    bbox_height = F("bounding_box")[3] * F("$metadata.height")
    bbox_area = bbox_width * bbox_height

    print(dataset.group_slice)
    # left

    print(dataset.count("ground_truth.detections"))
    # 1438

    print(dataset.mean("ground_truth.detections[]", expr=bbox_area))
    # 8878.752327468706

You can customize the dataset's active slice by setting the
:meth:`group_slice <fiftyone.core.dataset.Dataset.group_slice>` property to
another slice name:

.. code-block:: python
    :linenos:

    dataset.group_slice = "right"

    print(dataset.count("ground_truth.detections"))
    # 1438

    print(dataset.bounds("ground_truth.detections[]", expr=bbox_area))
    # 9457.586300995526

As usual, you can combine views and aggregations to refine your statistics to
any subset of the dataset:

.. code-block:: python
    :linenos:

    print(dataset.count_values("ground_truth.detections.label"))
    # {'Pedestrian': 128, 'Car': 793, ...}

    view1 = dataset.take(5)
    print(view1.count_values("ground_truth.detections.label"))
    # {'Pedestrian': 1, 'Car': 23, ...}

    view2 = dataset.filter_labels("ground_truth", F("label") == "Pedestrian")
    print(view2.count_values("ground_truth.detections.label"))
    # {'Pedestrian': 128}

In particular, if you would like to compute statistics across multiple group
slices, you can :ref:`select them <groups-selecting-slices>`!

.. code-block:: python
    :linenos:

    print(dataset.count())  # 200
    print(dataset.count("ground_truth.detections"))  # 1438

    view3 = dataset.select_group_slices(["left", "right"])

    print(view3.count())  # 400
    print(view3.count("ground_truth.detections"))  # 2876

.. _groups-app:

Groups in the App
_________________

When you load a grouped dataset or view in :ref:`the App <fiftyone-app>`,
you'll see the samples from the collection's
:ref:`default group slice <groups-dataset-properties>` in the grid view by
default.

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart-groups")

    session = fo.launch_app(dataset)

You can use the selector shown below to change which slice you are viewing:

.. image:: /images/groups/groups-grid-view.gif
   :alt: groups-grid-view
   :align: center

.. note::

    The grid view currently supports only image or video slices (not point
    clouds).

When you open the expanded modal with a grouped dataset or view loaded in the
App, you'll have access to all samples in the current group.

If the group contains image/video slices, the lefthand side of the modal will
contain a scrollable carousel that you can use to choose which sample to load
in the maximized image/video visualizer below.

If the group contains a point cloud slice, the righthand side of the modal will
contain a 3D visualizer.

.. image:: /images/groups/groups-modal.gif
   :alt: groups-modal
   :align: center

By default, the filters sidebar shows statistics for **only** the group slice
that currently has focus in the grid/modal. In the grid view, the active slice
is denoted by the selector in the upper-right corner of the grid, and in the
modal, the active sample is denoted by the `pin icon` in the upper-left corner.

However, you can opt to show statistics across all slices of a grouped dataset
by selecting `group` mode under the App's settings menu:

.. image:: /images/groups/groups-stats.gif
   :alt: groups-stats
   :align: center

.. _3d-visualizer:

Using the 3D visualizer
-----------------------

The 3D visualizer allows you to interactively visualize point cloud samples
along with any associated 3D detections/polylines data:

.. image:: /images/groups/groups-point-cloud-controls.gif
   :alt: groups-point-cloud-controls
   :align: center

The table below summarizes the mouse/keyboard controls that the 3D visualizer
supports:

.. table::
    :widths: 30 30 40

    +--------------+----------------+-------------------------------+
    | Input        | Action         | Description                   |
    +==============+================+===============================+
    | Wheel        | Zoom           | Zoom in and out               |
    +--------------+----------------+-------------------------------+
    | Drag         | Rotate         | Rotate the camera             |
    +--------------+----------------+-------------------------------+
    | Shift + drag | Translate      | Translate the camera          |
    +--------------+----------------+-------------------------------+
    | T            | Top-down       | Reset camera to top-down view |
    +--------------+----------------+-------------------------------+
    | E            | Ego-view       | Reset the camera to ego view  |
    +--------------+----------------+-------------------------------+
    | ESC          | Escape context | Escape the current context    |
    +--------------+----------------+-------------------------------+

In addition, the HUD at the bottom of the 3D visualizer provides the following
controls:

-   Use the palette icon to choose whether the point cloud is colored by
    `intensity`, `height`, or no coloring
-   Click the `T` to reset the camera to top-down view
-   Click the `E` to reset the camera to ego-view

When coloring by intensity, the color of each point is computed by mapping the
`r` channel of the `rgb` field of the
`PCD file <https://pointclouds.org/documentation/tutorials/pcd_file_format.html>`_
onto a fixed colormap, which is scaled so that the full colormap is matched to
the observed dynamic range of `r` values for each sample.

Similarly, when coloring by height, the `z` value of each point is mapped to
the full colormap using the same strategy.

.. note::

    The 3D visualizer does not currently support groups with multiple point
    cloud slices.

.. _3d-visualizer-config:

Configuring the 3D visualizer
-----------------------------

The 3D visualizer can be configured by including any subset of the settings
shown below under the `plugins.3d` key of your
:ref:`App config <configuring-fiftyone-app>`:

.. code-block:: json

    // The default values are shown below
    {
        "plugins": {
            "3d": {
                // Whether to show the 3D visualizer
                "enabled": true,

                // Whether to use legacy coordinates, where the y coordinate of
                // the `location` of 3D detections is offset by half of the
                // object's y size
                "useLegacyCoordinates": true,

                // The initial camera position in the 3D scene
                "defaultCameraPosition": {"x": 0, "y": 0, "z": 0},

                // Transformation from PCD -> scene coordinates
                "pointCloud": {
                    // A rotation to apply to the PCD's coordinate system
                    "rotation": [0, 0, 0],

                    // Don't render points below this z value
                    "minZ": null
                },

                // Transformation from Label -> scene coorindates
                "overlay": {
                    // A rotation to apply to the Label's coordinate system
                    "rotation": [0, 0, 0],

                    // A rotation to apply to each object's local coordinates
                    "itemRotation": [0, 0, 0]
                }
            }
        }
    }

.. note::

    All `rotations <https://threejs.org/docs/#api/en/core/Object3D.rotation>`_
    above are expressed using
    `Euler angles <https://en.wikipedia.org/wiki/Euler_angles>`_, in degrees.

You can also store dataset-specific plugin settings by storing any subset of
the above values on a :ref:`dataset's App config <custom-app-config>`:

.. code-block:: python
    :linenos:

    # Configure the 3D visualuzer for a dataset's PCD/Label data
    dataset.app_config.plugins["3d"] = {
        "defaultCameraPosition": {"x": 0, "y": 0, "z": 100},
        "pointCloud": {
            "rotation": [0, 0, 90],
            "minZ": -2.1
        },
        "overlay": {
            "rotation": [-90, 0, 0],
            "itemRotation": [0, 90, 0]
        }
    }
    dataset.save()

.. note::

    Dataset-specific plugin settings will override any settings from your
    :ref:`global App config <configuring-fiftyone-app>`.

.. _groups-importing:

Importing groups
________________

The simplest way to import grouped datasets is to
:ref:`write a Python loop <groups-adding-samples>`:

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

Remember that each group is represented by a |Group| instance, and each sample
in a group is denoted by its slice `name` using
:meth:`Group.element() <fiftyone.core.groups.Group.element>`. The |Sample|
objects can then simply be added to the dataset as usual.

Alternatively, you can
:ref:`write your own importer <writing-a-custom-dataset-importer>` and then
import grouped datasets in your custom format using the syntax below:

.. code-block:: python
    :linenos:

    # Create an instance of your custom dataset importer
    importer = CustomGroupDatasetImporter(...)

    dataset = fo.Dataset.from_importer(importer)

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

You can also :ref:`select specific slice(s) <groups-selecting-slices>` and then
export the resulting ungrouped collection in
:ref:`all the usual ways <exporting-datasets>`:

.. code-block:: python
    :linenos:

    left_view = dataset.shuffle().limit(10).select_group_slices("left")

    left_view.export(
        export_dir="/tmp/groups-left",
        dataset_type=fo.types.ImageDirectory,
    )

Alternatively, you can
:ref:`write your own exporter <writing-a-custom-dataset-exporter>` and then
export grouped datasets in your custom format using the syntax below:

.. code-block:: python
    :linenos:

    # Create an instance of your custom dataset exporter
    exporter = CustomGroupDatasetExporter(...)

    dataset_or_view.export(dataset_exporter=exporter, ...)
