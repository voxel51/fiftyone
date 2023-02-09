"""
FiftyOne datasets.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
import contextlib
from datetime import datetime
import fnmatch
import itertools
import logging
import numbers
import os
import random
import string

from bson import json_util, ObjectId
import cachetools
from deprecated import deprecated
import mongoengine.errors as moe
from pymongo import DeleteMany, InsertOne, ReplaceOne, UpdateMany, UpdateOne
from pymongo.errors import CursorNotFound, BulkWriteError

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as focn
import fiftyone.core.collections as foc
import fiftyone.core.expressions as foe
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.groups as fog
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fome
from fiftyone.core.odm.dataset import SampleFieldDocument
from fiftyone.core.odm.dataset import DatasetAppConfig
import fiftyone.migrations as fomi
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
from fiftyone.core.singletons import DatasetSingleton
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

fost = fou.lazy_import("fiftyone.core.stages")
foud = fou.lazy_import("fiftyone.utils.data")


logger = logging.getLogger(__name__)


def list_datasets(info=False):
    """Lists the available FiftyOne datasets.

    Args:
        info (False): whether to return info dicts describing each dataset
            rather than just their names

    Returns:
        a list of dataset names or info dicts
    """
    if info:
        return _list_dataset_info()

    return _list_datasets()


def dataset_exists(name):
    """Checks if the dataset exists.

    Args:
        name: the name of the dataset

    Returns:
        True/False
    """
    conn = foo.get_db_conn()
    return bool(list(conn.datasets.find({"name": name}, {"_id": 1}).limit(1)))


def _validate_dataset_name(name, skip=None):
    """Validates that the given dataset name is available.

    Args:
        name: a dataset name
        skip (None): an optional :class:`Dataset` to ignore

    Returns:
        the slug

    Raises:
        ValueError: if the name is not available
    """
    slug = fou.to_slug(name)

    query = {"$or": [{"name": name}, {"slug": slug}]}
    if skip is not None:
        query = {"$and": [query, {"_id": {"$ne": skip._doc.id}}]}

    conn = foo.get_db_conn()
    if bool(list(conn.datasets.find(query, {"_id": 1}).limit(1))):
        raise ValueError("Dataset name '%s' is not available" % name)

    return slug


def load_dataset(name):
    """Loads the FiftyOne dataset with the given name.

    To create a new dataset, use the :class:`Dataset` constructor.

    .. note::

        :class:`Dataset` instances are singletons keyed by their name, so all
        calls to this method with a given dataset ``name`` in a program will
        return the same object.

    Args:
        name: the name of the dataset

    Returns:
        a :class:`Dataset`
    """
    return Dataset(name, _create=False)


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    now = datetime.now()
    name = now.strftime("%Y.%m.%d.%H.%M.%S")
    if name in _list_datasets(include_private=True):
        name = now.strftime("%Y.%m.%d.%H.%M.%S.%f")

    return name


def make_unique_dataset_name(root):
    """Makes a unique dataset name with the given root name.

    Args:
        root: the root name for the dataset

    Returns:
        the dataset name
    """
    if not root:
        return get_default_dataset_name()

    name = root
    dataset_names = _list_datasets(include_private=True)

    if name in dataset_names:
        name += "_" + _get_random_characters(6)

    while name in dataset_names:
        name += _get_random_characters(1)

    return name


def get_default_dataset_dir(name):
    """Returns the default dataset directory for the dataset with the given
    name.

    Args:
        name: the dataset name

    Returns:
        the default directory for the dataset
    """
    return os.path.join(fo.config.default_dataset_dir, name)


def delete_dataset(name, verbose=False):
    """Deletes the FiftyOne dataset with the given name.

    Args:
        name: the name of the dataset
        verbose (False): whether to log the name of the deleted dataset
    """
    dataset = load_dataset(name)
    dataset.delete()
    if verbose:
        logger.info("Dataset '%s' deleted", name)


def delete_datasets(glob_patt, verbose=False):
    """Deletes all FiftyOne datasets whose names match the given glob pattern.

    Args:
        glob_patt: a glob pattern of datasets to delete
        verbose (False): whether to log the names of deleted datasets
    """
    all_datasets = _list_datasets()
    for name in fnmatch.filter(all_datasets, glob_patt):
        delete_dataset(name, verbose=verbose)


def delete_non_persistent_datasets(verbose=False):
    """Deletes all non-persistent datasets.

    Args:
        verbose (False): whether to log the names of deleted datasets
    """
    conn = foo.get_db_conn()

    for name in conn.datasets.find({"persistent": False}).distinct("name"):
        try:
            dataset = Dataset(name, _create=False, _virtual=True)
        except:
            # If the dataset can't be loaded, it likely requires migration,
            # which means it is persistent, so we don't worry about it here
            continue

        if not dataset.persistent and not dataset.deleted:
            dataset.delete()
            if verbose:
                logger.info("Dataset '%s' deleted", name)


class Dataset(foc.SampleCollection, metaclass=DatasetSingleton):
    """A FiftyOne dataset.

    Datasets represent an ordered collection of
    :class:`fiftyone.core.sample.Sample` instances that describe a particular
    type of raw media (e.g., images or videos) together with a user-defined set
    of fields.

    FiftyOne datasets ingest and store the labels for all samples internally;
    raw media is stored on disk and the dataset provides paths to the data.

    See :ref:`this page <using-datasets>` for an overview of working with
    FiftyOne datasets.

    Args:
        name (None): the name of the dataset. By default,
            :func:`get_default_dataset_name` is used
        persistent (False): whether the dataset should persist in the database
            after the session terminates
        overwrite (False): whether to overwrite an existing dataset of the same
            name
    """

    def __init__(
        self,
        name=None,
        persistent=False,
        overwrite=False,
        _create=True,
        _virtual=False,
        **kwargs,
    ):
        if name is None and _create:
            name = get_default_dataset_name()

        if overwrite and dataset_exists(name):
            delete_dataset(name)

        if _create:
            doc, sample_doc_cls, frame_doc_cls = _create_dataset(
                self, name, persistent=persistent, **kwargs
            )
        else:
            doc, sample_doc_cls, frame_doc_cls = _load_dataset(
                self, name, virtual=_virtual
            )

        self._doc = doc
        self._sample_doc_cls = sample_doc_cls
        self._frame_doc_cls = frame_doc_cls

        self._group_slice = doc.default_group_slice

        self._annotation_cache = cachetools.LRUCache(5)
        self._brain_cache = cachetools.LRUCache(5)
        self._evaluation_cache = cachetools.LRUCache(5)

        self._deleted = False

        if not _virtual:
            self._update_last_loaded_at()

    def __eq__(self, other):
        return type(other) == type(self) and self.name == other.name

    def __copy__(self):
        return self  # datasets are singletons

    def __deepcopy__(self, memo):
        return self  # datasets are singletons

    def __len__(self):
        return self.count()

    def __getitem__(self, id_filepath_slice):
        if isinstance(id_filepath_slice, numbers.Integral):
            raise ValueError(
                "Accessing dataset samples by numeric index is not supported. "
                "Use sample IDs, filepaths, slices, boolean arrays, or a "
                "boolean ViewExpression instead"
            )

        if isinstance(id_filepath_slice, slice):
            return self.view()[id_filepath_slice]

        if isinstance(id_filepath_slice, foe.ViewExpression):
            return self.view()[id_filepath_slice]

        if etau.is_container(id_filepath_slice):
            return self.view()[id_filepath_slice]

        try:
            oid = ObjectId(id_filepath_slice)
            query = {"_id": oid}
        except:
            oid = None
            query = {"filepath": id_filepath_slice}

        d = self._sample_collection.find_one(query)

        if d is None:
            field = "ID" if oid is not None else "filepath"
            raise KeyError(
                "No sample found with %s '%s'" % (field, id_filepath_slice)
            )

        doc = self._sample_dict_to_doc(d)
        return fos.Sample.from_doc(doc, dataset=self)

    def __delitem__(self, samples_or_ids):
        self.delete_samples(samples_or_ids)

    def __getattribute__(self, name):
        #
        # The attributes necessary to determine a dataset's name and whether
        # it is deleted are always available. If a dataset is deleted, no other
        # methods are available
        #
        if name.startswith("__") or name in (
            "name",
            "deleted",
            "_deleted",
            "_doc",
        ):
            return super().__getattribute__(name)

        if getattr(self, "_deleted", False):
            raise ValueError("Dataset '%s' is deleted" % self.name)

        return super().__getattribute__(name)

    @property
    def _dataset(self):
        return self

    @property
    def _root_dataset(self):
        return self

    @property
    def _is_generated(self):
        return self._is_patches or self._is_frames or self._is_clips

    @property
    def _is_patches(self):
        return self._sample_collection_name.startswith("patches.")

    @property
    def _is_frames(self):
        return self._sample_collection_name.startswith(
            ("frames.", "patches.frames")
        )

    @property
    def _is_clips(self):
        return self._sample_collection_name.startswith("clips.")

    @property
    def media_type(self):
        """The media type of the dataset."""
        return self._doc.media_type

    @media_type.setter
    def media_type(self, media_type):
        if media_type == self._doc.media_type:
            return

        if media_type not in fom.MEDIA_TYPES and media_type != fom.GROUP:
            raise ValueError(
                "Invalid media_type '%s'. Supported values are %s"
                % (media_type, fom.MEDIA_TYPES)
            )

        if len(self) > 0:
            raise ValueError("Cannot set media type of a non-empty dataset")

        self._set_media_type(media_type)

    def _set_media_type(self, media_type):
        self._doc.media_type = media_type

        if media_type == fom.VIDEO:
            self._declare_frame_fields()

        if media_type != fom.GROUP:
            self._update_metadata_field(media_type)

            self._doc.save()
            self.reload()
        else:
            # The `metadata` field of group datasets always stays as the
            # generic `Metadata` type because slices may have different types
            self._doc.save()

    def _update_metadata_field(self, media_type):
        idx = None
        for i, field in enumerate(self._doc.sample_fields):
            if field.name == "metadata":
                idx = i

        if idx is not None:
            if media_type == fom.IMAGE:
                doc_type = fome.ImageMetadata
            elif media_type == fom.VIDEO:
                doc_type = fome.VideoMetadata
            else:
                doc_type = fome.Metadata

            field = foo.create_field(
                "metadata",
                fof.EmbeddedDocumentField,
                embedded_doc_type=doc_type,
            )
            field_doc = foo.SampleFieldDocument.from_field(field)
            self._doc.sample_fields[idx] = field_doc

    def _declare_frame_fields(self):
        # pylint: disable=no-member
        self._doc.frame_fields = [
            foo.SampleFieldDocument.from_field(field)
            for field in self._frame_doc_cls._fields.values()
        ]

    @property
    def group_field(self):
        """The group field of the dataset, or None if the dataset is not
        grouped.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            print(dataset.group_field)
            # group
        """
        return self._doc.group_field

    @property
    def group_slice(self):
        """The current group slice of the dataset, or None if the dataset is
        not grouped.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            print(dataset.group_slices)
            # ['left', 'right', 'pcd']

            print(dataset.group_slice)
            # left

            # Change the current group slice
            dataset.group_slice = "right"

            print(dataset.group_slice)
            # right
        """
        return self._group_slice

    @group_slice.setter
    def group_slice(self, slice_name):
        if self.media_type != fom.GROUP:
            raise ValueError("Dataset has no groups")

        if slice_name is None:
            slice_name = self._doc.default_group_slice

        if slice_name not in self._doc.group_media_types:
            raise ValueError("Dataset has no group slice '%s'" % slice_name)

        self._group_slice = slice_name

    @property
    def group_slices(self):
        """The list of group slices of the dataset, or None if the dataset is
        not grouped.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            print(dataset.group_slices)
            # ['left', 'right', 'pcd']
        """
        if self.media_type != fom.GROUP:
            return None

        return list(self._doc.group_media_types.keys())

    @property
    def group_media_types(self):
        """A dict mapping group slices to media types, or None if the dataset
        is not grouped.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            print(dataset.group_media_types)
            # {'left': 'image', 'right': 'image', 'pcd': 'point-cloud'}
        """
        if self.media_type != fom.GROUP:
            return None

        return self._doc.group_media_types

    @property
    def default_group_slice(self):
        """The default group slice of the dataset, or None if the dataset is
        not grouped.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            print(dataset.default_group_slice)
            # left

            # Change the default group slice
            dataset.default_group_slice = "right"

            print(dataset.default_group_slice)
            # right
        """
        if self.media_type != fom.GROUP:
            return None

        return self._doc.default_group_slice

    @default_group_slice.setter
    def default_group_slice(self, slice_name):
        if self.media_type != fom.GROUP:
            raise ValueError("Dataset has no groups")

        if slice_name not in self._doc.group_media_types:
            raise ValueError("Dataset has no group slice '%s'" % slice_name)

        self._doc.default_group_slice = slice_name
        self._doc.save()

        if self._group_slice is None:
            self._group_slice = slice_name

    @property
    def version(self):
        """The version of the ``fiftyone`` package for which the dataset is
        formatted.
        """
        return self._doc.version

    @property
    def name(self):
        """The name of the dataset."""
        return self._doc.name

    @name.setter
    def name(self, name):
        _name = self._doc.name

        if name == _name:
            return

        slug = _validate_dataset_name(name, skip=self)

        self._doc.name = name
        self._doc.slug = slug
        self._doc.save(safe=True)

        # Update singleton
        self._instances.pop(_name, None)
        self._instances[name] = self

    @property
    def slug(self):
        """The slug of the dataset."""
        return self._doc.slug

    @property
    def created_at(self):
        """The datetime that the dataset was created."""
        return self._doc.created_at

    @property
    def last_loaded_at(self):
        """The datetime that the dataset was last loaded."""
        return self._doc.last_loaded_at

    @property
    def persistent(self):
        """Whether the dataset persists in the database after a session is
        terminated.
        """
        return self._doc.persistent

    @persistent.setter
    def persistent(self, value):
        self._doc.persistent = value
        self._doc.save(safe=True)

    @property
    def tags(self):
        """A list of tags on the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Add some tags
            dataset.tags = ["test", "projectA"]

            # Edit the tags
            dataset.tags.pop()
            dataset.tags.append("projectB")
            dataset.save()  # must save after edits
        """
        return self._doc.tags

    @tags.setter
    def tags(self, value):
        self._doc.tags = value
        self._doc.save(safe=True)

    @property
    def description(self):
        """A string description on the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Store a description on the dataset
            dataset.description = "Your description here"
        """
        return self._doc.description

    @description.setter
    def description(self, description):
        self._doc.description = description
        self._doc.save()

    @property
    def info(self):
        """A user-facing dictionary of information about the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Store a class list in the dataset's info
            dataset.info = {"classes": ["cat", "dog"]}

            # Edit the info
            dataset.info["other_classes"] = ["bird", "plane"]
            dataset.save()  # must save after edits
        """
        return self._doc.info

    @info.setter
    def info(self, info):
        self._doc.info = info
        self._doc.save(safe=True)

    @property
    def app_config(self):
        """A :class:`fiftyone.core.odm.dataset.DatasetAppConfig` that
        customizes how this dataset is visualized in the
        :ref:`FiftyOne App <fiftyone-app>`.

        Examples::

            import fiftyone as fo
            import fiftyone.utils.image as foui
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            # View the dataset's current App config
            print(dataset.app_config)

            # Generate some thumbnail images
            foui.transform_images(
                dataset,
                size=(-1, 32),
                output_field="thumbnail_path",
                output_dir="/tmp/thumbnails",
            )

            # Modify the dataset's App config
            dataset.app_config.media_fields = ["filepath", "thumbnail_path"]
            dataset.app_config.grid_media_field = "thumbnail_path"
            dataset.save()  # must save after edits

            session = fo.launch_app(dataset)
        """
        return self._doc.app_config

    @app_config.setter
    def app_config(self, config):
        if config is None:
            config = DatasetAppConfig()

        self._doc.app_config = config
        self._doc.save(safe=True)

    @property
    def classes(self):
        """A dict mapping field names to list of class label strings for the
        corresponding fields of the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set classes for the `ground_truth` and `predictions` fields
            dataset.classes = {
                "ground_truth": ["cat", "dog"],
                "predictions": ["cat", "dog", "other"],
            }

            # Edit an existing classes list
            dataset.classes["ground_truth"].append("other")
            dataset.save()  # must save after edits
        """
        return self._doc.classes

    @classes.setter
    def classes(self, classes):
        self._doc.classes = classes
        self._doc.save(safe=True)

    @property
    def default_classes(self):
        """A list of class label strings for all
        :class:`fiftyone.core.labels.Label` fields of this dataset that do not
        have customized classes defined in :meth:`classes`.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set default classes
            dataset.default_classes = ["cat", "dog"]

            # Edit the default classes
            dataset.default_classes.append("rabbit")
            dataset.save()  # must save after edits
        """
        return self._doc.default_classes

    @default_classes.setter
    def default_classes(self, classes):
        self._doc.default_classes = classes
        self._doc.save(safe=True)

    @property
    def mask_targets(self):
        """A dict mapping field names to mask target dicts, each of which
        defines a mapping between pixel values (2D masks) or RGB hex strings
        (3D masks) and label strings for the segmentation masks in the
        corresponding field of the dataset.

        Examples::

            import fiftyone as fo

            #
            # 2D masks
            #

            dataset = fo.Dataset()

            # Set mask targets for the `ground_truth` and `predictions` fields
            dataset.mask_targets = {
                "ground_truth": {1: "cat", 2: "dog"},
                "predictions": {1: "cat", 2: "dog", 255: "other"},
            }

            # Or, for RGB mask targets
            dataset.mask_targets = {
                "segmentations": {"#3f0a44": "road", "#eeffee": "building", "#ffffff": "other"}
            }

            # Edit an existing mask target
            dataset.mask_targets["ground_truth"][255] = "other"
            dataset.save()  # must save after edits

            #
            # 3D masks
            #

            dataset = fo.Dataset()

            # Set mask targets for the `ground_truth` and `predictions` fields
            dataset.mask_targets = {
                "ground_truth": {"#499CEF": "cat", "#6D04FF": "dog"},
                "predictions": {
                    "#499CEF": "cat", "#6D04FF": "dog", "#FF6D04": "person"
                },
            }

            # Edit an existing mask target
            dataset.mask_targets["ground_truth"]["#FF6D04"] = "person"
            dataset.save()  # must save after edits
        """
        return self._doc.mask_targets

    @mask_targets.setter
    def mask_targets(self, targets):
        self._doc.mask_targets = targets
        self._doc.save(safe=True)

    @property
    def default_mask_targets(self):
        """A dict defining a default mapping between pixel values (2D masks) or
        RGB hex strings (3D masks) and label strings for the segmentation masks
        of all :class:`fiftyone.core.labels.Segmentation` fields of this
        dataset that do not have customized mask targets defined in
        :meth:`mask_targets`.

        Examples::

            import fiftyone as fo

            #
            # 2D masks
            #

            dataset = fo.Dataset()

            # Set default mask targets
            dataset.default_mask_targets = {1: "cat", 2: "dog"}

            # Or, for RGB mask targets
            dataset.default_mask_targets = {"#3f0a44": "road", "#eeffee": "building", "#ffffff": "other"}

            # Edit the default mask targets
            dataset.default_mask_targets[255] = "other"
            dataset.save()  # must save after edits

            #
            # 3D masks
            #

            dataset = fo.Dataset()

            # Set default mask targets
            dataset.default_mask_targets = {"#499CEF": "cat", "#6D04FF": "dog"}

            # Edit the default mask targets
            dataset.default_mask_targets["#FF6D04"] = "person"
            dataset.save()  # must save after edits
        """
        return self._doc.default_mask_targets

    @default_mask_targets.setter
    def default_mask_targets(self, targets):
        self._doc.default_mask_targets = targets
        self._doc.save(safe=True)

    @property
    def skeletons(self):
        """A dict mapping field names to
        :class:`fiftyone.core.odm.dataset.KeypointSkeleton` instances, each of
        which defines the semantic labels and point connectivity for the
        :class:`fiftyone.core.labels.Keypoint` instances in the corresponding
        field of the dataset.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set keypoint skeleton for the `ground_truth` field
            dataset.skeletons = {
                "ground_truth": fo.KeypointSkeleton(
                    labels=[
                        "left hand" "left shoulder", "right shoulder", "right hand",
                        "left eye", "right eye", "mouth",
                    ],
                    edges=[[0, 1, 2, 3], [4, 5, 6]],
                )
            }

            # Edit an existing skeleton
            dataset.skeletons["ground_truth"].labels[-1] = "lips"
            dataset.save()  # must save after edits
        """
        return self._doc.skeletons

    @skeletons.setter
    def skeletons(self, skeletons):
        self._doc.skeletons = skeletons
        self._doc.save(safe=True)

    @property
    def default_skeleton(self):
        """A default :class:`fiftyone.core.odm.dataset.KeypointSkeleton`
        defining the semantic labels and point connectivity for all
        :class:`fiftyone.core.labels.Keypoint` fields of this dataset that do
        not have customized skeletons defined in :meth:`skeleton`.

        Examples::

            import fiftyone as fo

            dataset = fo.Dataset()

            # Set default keypoint skeleton
            dataset.default_skeleton = fo.KeypointSkeleton(
                labels=[
                    "left hand" "left shoulder", "right shoulder", "right hand",
                    "left eye", "right eye", "mouth",
                ],
                edges=[[0, 1, 2, 3], [4, 5, 6]],
            )

            # Edit the default skeleton
            dataset.default_skeleton.labels[-1] = "lips"
            dataset.save()  # must save after edits
        """
        return self._doc.default_skeleton

    @default_skeleton.setter
    def default_skeleton(self, skeleton):
        self._doc.default_skeleton = skeleton
        self._doc.save(safe=True)

    @property
    def deleted(self):
        """Whether the dataset is deleted."""
        return self._deleted

    def summary(self):
        """Returns a string summary of the dataset.

        Returns:
            a string summary
        """
        elements = [
            ("Name:", self.name),
            ("Media type:", self.media_type),
            ("Num %s:" % self._elements_str, self.count()),
            ("Persistent:", self.persistent),
            ("Tags:", self.tags),
        ]

        if self.media_type == fom.GROUP:
            elements.insert(2, ("Group slice:", self.group_slice))

        elements = fou.justify_headings(elements)
        lines = ["%s %s" % tuple(e) for e in elements]

        lines.extend(
            ["Sample fields:", self._to_fields_str(self.get_field_schema())]
        )

        if self._has_frame_fields():
            lines.extend(
                [
                    "Frame fields:",
                    self._to_fields_str(self.get_frame_field_schema()),
                ]
            )

        return "\n".join(lines)

    def stats(self, include_media=False, compressed=False):
        """Returns stats about the dataset on disk.

        The ``samples`` keys refer to the sample documents stored in the
        database.

        The ``media`` keys refer to the raw media associated with each sample
        on disk.

        For video datasets, the ``frames`` keys refer to the frame documents
        stored in the database.

        Note that dataset-level metadata such as annotation runs are not
        included in this computation.

        Args:
            include_media (False): whether to include stats about the size of
                the raw media in the dataset
            compressed (False): whether to return the sizes of collections in
                their compressed form on disk (True) or the logical
                uncompressed size of the collections (False)

        Returns:
            a stats dict
        """
        contains_videos = self._contains_videos(any_slice=True)

        stats = {}

        conn = foo.get_db_conn()

        cs = conn.command("collstats", self._sample_collection_name)
        samples_bytes = cs["storageSize"] if compressed else cs["size"]
        stats["samples_count"] = cs["count"]
        stats["samples_bytes"] = samples_bytes
        stats["samples_size"] = etau.to_human_bytes_str(samples_bytes)
        total_bytes = samples_bytes

        if contains_videos:
            cs = conn.command("collstats", self._frame_collection_name)
            frames_bytes = cs["storageSize"] if compressed else cs["size"]
            stats["frames_count"] = cs["count"]
            stats["frames_bytes"] = frames_bytes
            stats["frames_size"] = etau.to_human_bytes_str(frames_bytes)
            total_bytes += frames_bytes

        if include_media:
            if self.media_type == fom.GROUP:
                samples = self.select_group_slices(_allow_mixed=True)
            else:
                samples = self

            samples.compute_metadata()
            media_bytes = samples.sum("metadata.size_bytes")
            stats["media_bytes"] = media_bytes
            stats["media_size"] = etau.to_human_bytes_str(media_bytes)
            total_bytes += media_bytes

        stats["total_bytes"] = total_bytes
        stats["total_size"] = etau.to_human_bytes_str(total_bytes)

        return stats

    def first(self):
        """Returns the first sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        return super().first()

    def last(self):
        """Returns the last sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        try:
            sample_view = self[-1:].first()
        except ValueError:
            raise ValueError("%s is empty" % self.__class__.__name__)

        return fos.Sample.from_doc(sample_view._doc, dataset=self)

    def head(self, num_samples=3):
        """Returns a list of the first few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [
            fos.Sample.from_doc(sv._doc, dataset=self)
            for sv in self[:num_samples]
        ]

    def tail(self, num_samples=3):
        """Returns a list of the last few samples in the dataset.

        If fewer than ``num_samples`` samples are in the dataset, only the
        available samples are returned.

        Args:
            num_samples (3): the number of samples

        Returns:
            a list of :class:`fiftyone.core.sample.Sample` objects
        """
        return [
            fos.Sample.from_doc(sv._doc, dataset=self)
            for sv in self[-num_samples:]
        ]

    def view(self):
        """Returns a :class:`fiftyone.core.view.DatasetView` containing the
        entire dataset.

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        return fov.DatasetView(self)

    def get_field_schema(
        self,
        ftype=None,
        embedded_doc_type=None,
        include_private=False,
        flat=False,
    ):
        """Returns a schema dictionary describing the fields of the samples in
        the dataset.

        Args:
            ftype (None): an optional field type or iterable of types to which
                to restrict the returned schema. Must be subclass(es) of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type or
                iterable of types to which to restrict the returned schema.
                Must be subclass(es) of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys

        Returns:
             a dictionary mapping field names to field types
        """
        schema = self._sample_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

        if flat:
            schema = fof.flatten_schema(
                schema,
                ftype=ftype,
                embedded_doc_type=embedded_doc_type,
                include_private=include_private,
            )

        return schema

    def get_frame_field_schema(
        self,
        ftype=None,
        embedded_doc_type=None,
        include_private=False,
        flat=False,
    ):
        """Returns a schema dictionary describing the fields of the frames of
        the samples in the dataset.

        Only applicable for datasets that contain videos.

        Args:
            ftype (None): an optional field type or iterable of types to which
                to restrict the returned schema. Must be subclass(es) of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): an optional embedded document type or
                iterable of types to which to restrict the returned schema.
                Must be subclass(es) of
                :class:`fiftyone.core.odm.BaseEmbeddedDocument`
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys

        Returns:
            a dictionary mapping field names to field types, or ``None`` if the
            dataset does not contain videos
        """
        if not self._has_frame_fields():
            return None

        schema = self._frame_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            include_private=include_private,
        )

        if flat:
            schema = fof.flatten_schema(
                schema,
                ftype=ftype,
                embedded_doc_type=embedded_doc_type,
                include_private=include_private,
            )

        return schema

    def add_sample_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        **kwargs,
    ):
        """Adds a new sample field or embedded field to the dataset, if
        necessary.

        Args:
            field_name: the field name or ``embedded.field.name``
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
            fields (None): a list of :class:`fiftyone.core.fields.Field`
                instances defining embedded document attributes. Only
                applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            description (None): an optional description
            info (None): an optional info dict

        Raises:
            ValueError: if a field of the same name already exists and it is
                not compliant with the specified values
        """
        if embedded_doc_type is not None and issubclass(
            embedded_doc_type, fog.Group
        ):
            expanded = self._add_group_field(
                field_name, description=description, info=info
            )
        else:
            expanded = self._sample_doc_cls.add_field(
                field_name,
                ftype,
                embedded_doc_type=embedded_doc_type,
                subfield=subfield,
                fields=fields,
                description=description,
                info=info,
                **kwargs,
            )

        if expanded:
            self._reload()

    def _add_implied_sample_field(
        self, field_name, value, dynamic=False, validate=True
    ):
        if isinstance(value, fog.Group):
            expanded = self._add_group_field(field_name, default=value.name)
        else:
            expanded = self._sample_doc_cls.add_implied_field(
                field_name, value, dynamic=dynamic, validate=validate
            )

        if expanded:
            self._reload()

    def _merge_sample_field_schema(
        self,
        schema,
        expand_schema=True,
        recursive=True,
        validate=True,
    ):
        expanded = self._sample_doc_cls.merge_field_schema(
            schema,
            expand_schema=expand_schema,
            recursive=recursive,
            validate=validate,
        )

        if expanded:
            self._reload()

    def add_dynamic_sample_fields(self, fields=None, add_mixed=False):
        """Adds all dynamic sample fields to the dataset's schema.

        Dynamic fields are embedded document fields with at least one non-None
        value that have not been declared on the dataset's schema.

        Args:
            fields (None): an optional field or iterable of fields for which to
                add dynamic fields. By default, all fields are considered
            add_mixed (False): whether to declare fields that contain values
                of mixed types as generic :class:`fiftyone.core.fields.Field`
                instances (True) or to skip such fields (False)
        """
        dynamic_schema = self.get_dynamic_field_schema(fields=fields)

        schema = {}
        for path, field in dynamic_schema.items():
            if etau.is_container(field):
                if add_mixed:
                    schema[path] = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic field '%s' with mixed types %s",
                        path,
                        field,
                    )
            elif field is not None:
                schema[path] = field

        self._merge_sample_field_schema(schema)

    def add_frame_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        **kwargs,
    ):
        """Adds a new frame-level field or embedded field to the dataset, if
        necessary.

        Only applicable to datasets that contain videos.

        Args:
            field_name: the field name or ``embedded.field.name``
            ftype: the field type to create. Must be a subclass of
                :class:`fiftyone.core.fields.Field`
            embedded_doc_type (None): the
                :class:`fiftyone.core.odm.BaseEmbeddedDocument` type of the
                field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            subfield (None): the :class:`fiftyone.core.fields.Field` type of
                the contained field. Only applicable when ``ftype`` is
                :class:`fiftyone.core.fields.ListField` or
                :class:`fiftyone.core.fields.DictField`
            fields (None): a list of :class:`fiftyone.core.fields.Field`
                instances defining embedded document attributes. Only
                applicable when ``ftype`` is
                :class:`fiftyone.core.fields.EmbeddedDocumentField`
            description (None): an optional description
            info (None): an optional info dict

        Raises:
            ValueError: if a field of the same name already exists and it is
                not compliant with the specified values
        """
        if not self._has_frame_fields():
            raise ValueError(
                "Only datasets that contain videos may have frame fields"
            )

        expanded = self._frame_doc_cls.add_field(
            field_name,
            ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            fields=fields,
            description=description,
            info=info,
            **kwargs,
        )

        if expanded:
            self._reload()

    def _add_implied_frame_field(
        self, field_name, value, dynamic=False, validate=True
    ):
        if not self._has_frame_fields():
            raise ValueError(
                "Only datasets that contain videos may have frame fields"
            )

        expanded = self._frame_doc_cls.add_implied_field(
            field_name, value, dynamic=dynamic, validate=validate
        )

        if expanded:
            self._reload()

    def _merge_frame_field_schema(
        self,
        schema,
        expand_schema=True,
        recursive=True,
        validate=True,
    ):
        expanded = self._frame_doc_cls.merge_field_schema(
            schema,
            expand_schema=expand_schema,
            recursive=recursive,
            validate=validate,
        )

        if expanded:
            self._reload()

    def add_dynamic_frame_fields(self, fields=None, add_mixed=False):
        """Adds all dynamic frame fields to the dataset's schema.

        Dynamic fields are embedded document fields with at least one non-None
        value that have not been declared on the dataset's schema.

        Args:
            fields (None): an optional field or iterable of fields for which to
                add dynamic fields. By default, all fields are considered
            add_mixed (False): whether to declare fields that contain values
                of mixed types as generic :class:`fiftyone.core.fields.Field`
                instances (True) or to skip such fields (False)
        """
        if not self._has_frame_fields():
            raise ValueError(
                "Only datasets that contain videos may have frame fields"
            )

        dynamic_schema = self.get_dynamic_frame_field_schema(fields=fields)

        schema = {}
        for path, field in dynamic_schema.items():
            if etau.is_container(field):
                if add_mixed:
                    schema[path] = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic frame field '%s' with mixed types %s",
                        path,
                        field,
                    )
            elif field is not None:
                schema[path] = field

        self._merge_frame_field_schema(schema)

    def add_group_field(
        self, field_name, default=None, description=None, info=None
    ):
        """Adds a group field to the dataset, if necessary.

        Args:
            field_name: the field name
            default (None): a default group slice for the field
            description (None): an optional description
            info (None): an optional info dict

        Raises:
            ValueError: if a group field with another name already exists
        """
        expanded = self._add_group_field(
            field_name, default=default, description=description, info=info
        )

        if expanded:
            self._reload()

    def _add_group_field(self, field_name, default=None, **kwargs):
        expanded = self._sample_doc_cls.add_field(
            field_name,
            fof.EmbeddedDocumentField,
            embedded_doc_type=fog.Group,
            **kwargs,
        )

        if not expanded:
            return False

        self._doc.media_type = fom.GROUP

        if self._doc.group_media_types is None:
            self._doc.group_media_types = {}

        if self._doc.default_group_slice is None:
            self._doc.default_group_slice = default

        self._doc.group_field = field_name
        self._doc.save()

        self._group_slice = self._doc.default_group_slice

        self.create_index(field_name + "._id")
        self.create_index(field_name + ".name")

        return True

    def rename_sample_field(self, field_name, new_field_name):
        """Renames the sample field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._rename_sample_fields({field_name: new_field_name})

    def rename_sample_fields(self, field_mapping):
        """Renames the sample fields to the given new names.

        You can use dot notation (``embedded.field.name``) to rename embedded
        fields.

        Args:
            field_mapping: a dict mapping field names to new field names
        """
        self._rename_sample_fields(field_mapping)

    def rename_frame_field(self, field_name, new_field_name):
        """Renames the frame-level field to the given new name.

        You can use dot notation (``embedded.field.name``) to rename embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._rename_frame_fields({field_name: new_field_name})

    def rename_frame_fields(self, field_mapping):
        """Renames the frame-level fields to the given new names.

        You can use dot notation (``embedded.field.name``) to rename embedded
        frame fields.

        Args:
            field_mapping: a dict mapping field names to new field names
        """
        self._rename_frame_fields(field_mapping)

    def _rename_sample_fields(self, field_mapping, view=None):
        sample_collection = self if view is None else view

        paths, new_paths = zip(*field_mapping.items())
        self._sample_doc_cls._rename_fields(
            sample_collection, paths, new_paths
        )

        fields, _, _, _ = _parse_field_mapping(field_mapping)

        if fields:
            fos.Sample._purge_fields(self._sample_collection_name, fields)

        fos.Sample._reload_docs(self._sample_collection_name)
        self._reload()

    def _rename_frame_fields(self, field_mapping, view=None):
        sample_collection = self if view is None else view
        if not sample_collection._has_frame_fields():
            raise ValueError(
                "%s has no frame fields" % type(sample_collection)
            )

        paths, new_paths = zip(*field_mapping.items())
        self._frame_doc_cls._rename_fields(sample_collection, paths, new_paths)

        fields, _, _, _ = _parse_field_mapping(field_mapping)

        if fields:
            fofr.Frame._purge_fields(self._frame_collection_name, fields)

        fofr.Frame._reload_docs(self._frame_collection_name)
        self._reload()

    def clone_sample_field(self, field_name, new_field_name):
        """Clones the given sample field into a new field of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._clone_sample_fields({field_name: new_field_name})

    def clone_sample_fields(self, field_mapping):
        """Clones the given sample fields into new fields of the dataset.

        You can use dot notation (``embedded.field.name``) to clone embedded
        fields.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._clone_sample_fields(field_mapping)

    def clone_frame_field(self, field_name, new_field_name):
        """Clones the frame-level field into a new field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_name: the field name or ``embedded.field.name``
            new_field_name: the new field name or ``embedded.field.name``
        """
        self._clone_frame_fields({field_name: new_field_name})

    def clone_frame_fields(self, field_mapping):
        """Clones the frame-level fields into new fields.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_mapping: a dict mapping field names to new field names into
                which to clone each field
        """
        self._clone_frame_fields(field_mapping)

    def _clone_sample_fields(self, field_mapping, view=None):
        sample_collection = self if view is None else view

        paths, new_paths = zip(*field_mapping.items())
        self._sample_doc_cls._clone_fields(sample_collection, paths, new_paths)

        fos.Sample._reload_docs(self._sample_collection_name)
        self._reload()

    def _clone_frame_fields(self, field_mapping, view=None):
        sample_collection = self if view is None else view
        if not sample_collection._has_frame_fields():
            raise ValueError(
                "%s has no frame fields" % type(sample_collection)
            )

        paths, new_paths = zip(*field_mapping.items())
        self._frame_doc_cls._clone_fields(sample_collection, paths, new_paths)

        fofr.Frame._reload_docs(self._frame_collection_name)
        self._reload()

    def clear_sample_field(self, field_name):
        """Clears the values of the field from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._clear_sample_fields(field_name)

    def clear_sample_fields(self, field_names):
        """Clears the values of the fields from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Args:
            field_names: the field name or iterable of field names
        """
        self._clear_sample_fields(field_names)

    def clear_frame_field(self, field_name):
        """Clears the values of the frame-level field from all samples in the
        dataset.

        The field will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._clear_frame_fields(field_name)

    def clear_frame_fields(self, field_names):
        """Clears the values of the frame-level fields from all samples in the
        dataset.

        The fields will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clone embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_names: the field name or iterable of field names
        """
        self._clear_frame_fields(field_names)

    def _clear_sample_fields(self, field_names, view=None):
        sample_collection = self if view is None else view

        field_names = _to_list(field_names)
        self._sample_doc_cls._clear_fields(sample_collection, field_names)

        fos.Sample._reload_docs(self._sample_collection_name)

    def _clear_frame_fields(self, field_names, view=None):
        sample_collection = self if view is None else view
        if not sample_collection._has_frame_fields():
            raise ValueError(
                "%s has no frame fields" % type(sample_collection)
            )

        field_names = _to_list(field_names)
        self._frame_doc_cls._clear_fields(sample_collection, field_names)

        fofr.Frame._reload_docs(self._frame_collection_name)

    def delete_sample_field(self, field_name, error_level=0):
        """Deletes the field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_sample_fields(field_name, error_level)

    def delete_sample_fields(self, field_names, error_level=0):
        """Deletes the fields from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        fields.

        Args:
            field_names: the field name or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_sample_fields(field_names, error_level)

    def remove_dynamic_sample_field(self, field_name, error_level=0):
        """Removes the dynamic embedded sample field from the dataset's schema.

        The underlying data is **not** deleted from the samples.

        Args:
            field_name: the ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be removed
            -   1: log warning if a top-level field cannot be removed
            -   2: ignore top-level fields that cannot be removed
        """
        self._remove_dynamic_sample_fields(field_name, error_level)

    def remove_dynamic_sample_fields(self, field_names, error_level=0):
        """Removes the dynamic embedded sample fields from the dataset's
        schema.

        The underlying data is **not** deleted from the samples.

        Args:
            field_names: the ``embedded.field.name`` or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be removed
            -   1: log warning if a top-level field cannot be removed
            -   2: ignore top-level fields that cannot be removed
        """
        self._remove_dynamic_sample_fields(field_names, error_level)

    def delete_frame_field(self, field_name, error_level=0):
        """Deletes the frame-level field from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_name: the field name or ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_frame_fields(field_name, error_level)

    def delete_frame_fields(self, field_names, error_level=0):
        """Deletes the frame-level fields from all samples in the dataset.

        You can use dot notation (``embedded.field.name``) to delete embedded
        frame fields.

        Only applicable to datasets that contain videos.

        Args:
            field_names: a field name or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be deleted
            -   1: log warning if a top-level field cannot be deleted
            -   2: ignore top-level fields that cannot be deleted
        """
        self._delete_frame_fields(field_names, error_level)

    def remove_dynamic_frame_field(self, field_name, error_level=0):
        """Removes the dynamic embedded frame field from the dataset's schema.

        The underlying data is **not** deleted from the frames.

        Args:
            field_name: the ``embedded.field.name``
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be removed
            -   1: log warning if a top-level field cannot be removed
            -   2: ignore top-level fields that cannot be removed
        """
        self._remove_dynamic_frame_fields(field_name, error_level)

    def remove_dynamic_frame_fields(self, field_names, error_level=0):
        """Removes the dynamic embedded frame fields from the dataset's schema.

        The underlying data is **not** deleted from the frames.

        Args:
            field_names: the ``embedded.field.name`` or iterable of field names
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a top-level field cannot be removed
            -   1: log warning if a top-level field cannot be removed
            -   2: ignore top-level fields that cannot be removed
        """
        self._remove_dynamic_frame_fields(field_names, error_level)

    def _delete_sample_fields(self, field_names, error_level):
        field_names = _to_list(field_names)
        self._sample_doc_cls._delete_fields(
            field_names, error_level=error_level
        )

        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            fos.Sample._purge_fields(self._sample_collection_name, fields)

        if embedded_fields:
            fos.Sample._reload_docs(self._sample_collection_name)

        self._reload()

    def _remove_dynamic_sample_fields(self, field_names, error_level):
        field_names = _to_list(field_names)
        self._sample_doc_cls._remove_dynamic_fields(
            field_names, error_level=error_level
        )

        self._reload()

    def _delete_frame_fields(self, field_names, error_level):
        if not self._has_frame_fields():
            fou.handle_error(
                ValueError(
                    "Only datasets that contain videos have frame fields"
                ),
                error_level,
            )
            return

        field_names = _to_list(field_names)
        self._frame_doc_cls._delete_fields(
            field_names, error_level=error_level
        )

        fields, embedded_fields = _parse_fields(field_names)

        if fields:
            fofr.Frame._purge_fields(self._frame_collection_name, fields)

        if embedded_fields:
            fofr.Frame._reload_docs(self._frame_collection_name)

        self._reload()

    def _remove_dynamic_frame_fields(self, field_names, error_level):
        if not self._has_frame_fields():
            fou.handle_error(
                ValueError(
                    "Only datasets that contain videos have frame fields"
                ),
                error_level,
            )
            return

        field_names = _to_list(field_names)
        self._frame_doc_cls._remove_dynamic_fields(
            field_names, error_level=error_level
        )

        self._reload()

    def rename_group_slice(self, name, new_name):
        """Renames the group slice with the given name.

        Args:
            name: the group slice name
            new_name: the new group slice name
        """
        if self.media_type != fom.GROUP:
            raise ValueError("Dataset has no groups")

        if name not in self._doc.group_media_types:
            raise ValueError("Dataset has no group slice '%s'" % name)

        group_path = self.group_field + ".name"
        self.select_group_slices(name).set_field(group_path, new_name).save()

        new_media_type = self._doc.group_media_types.pop(name)
        self._doc.group_media_types[new_name] = new_media_type

        if self._doc.default_group_slice == name:
            self._doc.default_group_slice = new_name

        if self.group_slice == name:
            self.group_slice = new_name

        self._doc.save()

    def delete_group_slice(self, name):
        """Deletes all samples in the given group slice from the dataset.

        Args:
            name: a group slice name
        """
        if self.media_type != fom.GROUP:
            raise ValueError("Dataset has no groups")

        if name not in self._doc.group_media_types:
            raise ValueError("Dataset has no group slice '%s'" % name)

        self.delete_samples(self.select_group_slices(name))

        self._doc.group_media_types.pop(name)

        new_default = next(iter(self._doc.group_media_types.keys()), None)

        if self._doc.default_group_slice == name:
            self._doc.default_group_slice = new_default

        if self._group_slice == name:
            self._group_slice = new_default

        self._doc.save()

    def iter_samples(self, progress=False, autosave=False, batch_size=None):
        """Returns an iterator over the samples in the dataset.

        Examples::

            import random as r
            import string as s

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("cifar10", split="test")

            def make_label():
                return "".join(r.choice(s.ascii_letters) for i in range(10))

            # No save context
            for sample in dataset.iter_samples(progress=True):
                sample.ground_truth.label = make_label()
                sample.save()

            # Save in batches of 10
            for sample in dataset.iter_samples(
                progress=True, autosave=True, batch_size=10
            ):
                sample.ground_truth.label = make_label()

            # Save every 0.5 seconds
            for sample in dataset.iter_samples(
                progress=True, autosave=True, batch_size=0.5
            ):
                sample.ground_truth.label = make_label()

        Args:
            progress (False): whether to render a progress bar tracking the
                iterator's progress
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): a batch size to use when autosaving samples. Can
                either be an integer specifying the number of samples to save
                in a batch, or a float number of seconds between batched saves

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        with contextlib.ExitStack() as exit_context:
            samples = self._iter_samples()

            if progress:
                pb = fou.ProgressBar(total=len(self))
                exit_context.enter_context(pb)
                samples = pb(samples)

            if autosave:
                save_context = foc.SaveContext(self, batch_size=batch_size)
                exit_context.enter_context(save_context)

            for sample in samples:
                yield sample

                if autosave:
                    save_context.save(sample)

    def _iter_samples(self, pipeline=None):
        make_sample = self._make_sample_fcn()
        index = 0

        try:
            for d in self._aggregate(
                pipeline=pipeline,
                detach_frames=True,
                detach_groups=True,
            ):
                sample = make_sample(d)
                index += 1
                yield sample

        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset
            pipeline = [{"$skip": index}] + (pipeline or [])
            for sample in self._iter_samples(pipeline=pipeline):
                yield sample

    def _make_sample_fcn(self):
        def make_sample(d):
            doc = self._sample_dict_to_doc(d)
            return fos.Sample.from_doc(doc, dataset=self)

        return make_sample

    def iter_groups(
        self,
        group_slices=None,
        progress=False,
        autosave=False,
        batch_size=None,
    ):
        """Returns an iterator over the groups in the dataset.

        Examples::

            import random as r
            import string as s

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            def make_label():
                return "".join(r.choice(s.ascii_letters) for i in range(10))

            # No save context
            for group in dataset.iter_groups(progress=True):
                for sample in group.values():
                    sample["test"] = make_label()
                    sample.save()

            # Save in batches of 10
            for group in dataset.iter_groups(
                progress=True, autosave=True, batch_size=10
            ):
                for sample in group.values():
                    sample["test"] = make_label()

            # Save every 0.5 seconds
            for group in dataset.iter_groups(
                progress=True, autosave=True, batch_size=0.5
            ):
                for sample in group.values():
                    sample["test"] = make_label()

        Args:
            group_slices (None): an optional subset of group slices to load
            progress (False): whether to render a progress bar tracking the
                iterator's progress
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): a batch size to use when autosaving samples. Can
                either be an integer specifying the number of samples to save
                in a batch, or a float number of seconds between batched saves

        Returns:
            an iterator that emits dicts mapping group slice names to
            :class:`fiftyone.core.sample.Sample` instances, one per group
        """
        if self.media_type != fom.GROUP:
            raise ValueError("%s does not contain groups" % type(self))

        with contextlib.ExitStack() as exit_context:
            groups = self._iter_groups(group_slices=group_slices)

            if progress:
                pb = fou.ProgressBar(total=len(self))
                exit_context.enter_context(pb)
                groups = pb(groups)

            if autosave:
                save_context = foc.SaveContext(self, batch_size=batch_size)
                exit_context.enter_context(save_context)

            for group in groups:
                yield group

                if autosave:
                    for sample in group.values():
                        save_context.save(sample)

    def _iter_groups(self, group_slices=None, pipeline=None):
        make_sample = self._make_sample_fcn()
        index = 0

        group_field = self.group_field
        curr_id = None
        group = {}

        try:
            for d in self._aggregate(
                detach_frames=True,
                pipeline=pipeline,
                group_slices=group_slices,
                groups_only=True,
            ):
                sample = make_sample(d)

                group_id = sample[group_field].id
                if curr_id is None:
                    # First overall element
                    curr_id = group_id
                    group[sample[group_field].name] = sample
                elif group_id == curr_id:
                    # Add element to group
                    group[sample[group_field].name] = sample
                else:
                    # Flush last group
                    index += 1
                    yield group

                    # First element of new group
                    curr_id = group_id
                    group = {}
                    group[sample[group_field].name] = sample

            if group:
                yield group
        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset
            pipeline = [{"$skip": index}] + (pipeline or [])
            for group in self._iter_groups(
                group_slices=group_slices, pipeline=pipeline
            ):
                yield group

    def get_group(self, group_id, group_slices=None):
        """Returns a dict containing the samples for the given group ID.

        Args:
            group_id: a group ID
            group_slices (None): an optional subset of group slices to load

        Returns:
            a dict mapping group names to :class:`fiftyone.core.sample.Sample`
            instances

        Raises:
            KeyError: if the group ID is not found
        """
        if self.media_type != fom.GROUP:
            raise ValueError("%s does not contain groups" % type(self))

        if self.group_field is None:
            raise ValueError("%s has no group field" % type(self))

        group_field = self.group_field
        id_field = group_field + "._id"

        pipeline = [
            {
                "$match": {
                    "$expr": {"$eq": ["$" + id_field, ObjectId(group_id)]}
                }
            }
        ]

        try:
            return next(
                iter(
                    self._iter_groups(
                        group_slices=group_slices, pipeline=pipeline
                    )
                )
            )
        except StopIteration:
            raise KeyError(
                "No group found with ID '%s' in field '%s'"
                % (group_id, group_field)
            )

    def add_sample(
        self,
        sample,
        expand_schema=True,
        dynamic=False,
        validate=True,
    ):
        """Adds the given sample to the dataset.

        If the sample instance does not belong to a dataset, it is updated
        in-place to reflect its membership in this dataset. If the sample
        instance belongs to another dataset, it is not modified.

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            validate (True): whether to validate that the fields of the sample
                are compliant with the dataset schema before adding it

        Returns:
            the ID of the sample in the dataset
        """
        ids = self._add_samples_batch(
            [sample], expand_schema, dynamic, validate
        )
        return ids[0]

    def add_samples(
        self,
        samples,
        expand_schema=True,
        dynamic=False,
        validate=True,
        num_samples=None,
    ):
        """Adds the given samples to the dataset.

        Any sample instances that do not belong to a dataset are updated
        in-place to reflect membership in this dataset. Any sample instances
        that belong to other datasets are not modified.

        Args:
            samples: an iterable of :class:`fiftyone.core.sample.Sample`
                instances or a
                :class:`fiftyone.core.collections.SampleCollection`
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            validate (True): whether to validate that the fields of each sample
                are compliant with the dataset schema before adding it
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed via ``len(samples)``, if possible.
                This value is optional and is used only for progress tracking

        Returns:
            a list of IDs of the samples in the dataset
        """
        if num_samples is None:
            try:
                num_samples = len(samples)
            except:
                pass

        # Dynamically size batches so that they are as large as possible while
        # still achieving a nice frame rate on the progress bar
        batcher = fou.DynamicBatcher(
            samples,
            target_latency=0.2,
            init_batch_size=1,
            max_batch_beta=2.0,
            progress=True,
            total=num_samples,
        )

        sample_ids = []
        with batcher:
            for batch in batcher:
                _ids = self._add_samples_batch(
                    batch, expand_schema, dynamic, validate
                )
                sample_ids.extend(_ids)

        return sample_ids

    def add_collection(
        self,
        sample_collection,
        include_info=True,
        overwrite_info=False,
        new_ids=False,
    ):
        """Adds the contents of the given collection to the dataset.

        This method is a special case of :meth:`Dataset.merge_samples` that
        adds samples with new IDs to this dataset and omits any samples with
        existing IDs (the latter would only happen in rare cases).

        Use :meth:`Dataset.merge_samples` if you have multiple datasets whose
        samples refer to the same source media.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``include_info`` is True
            new_ids (False): whether to generate new sample/frame IDs. By
                default, the IDs of the input collection are retained

        Returns:
            a list of IDs of the samples that were added to this dataset
        """
        if new_ids:
            return _add_collection_with_new_ids(
                self,
                sample_collection,
                include_info=include_info,
                overwrite_info=overwrite_info,
            )

        num_samples = len(self)
        self.merge_samples(
            sample_collection,
            key_field="id",
            skip_existing=True,
            insert_new=True,
            include_info=include_info,
            overwrite_info=overwrite_info,
        )
        return self.skip(num_samples).values("id")

    def _add_samples_batch(self, samples, expand_schema, dynamic, validate):
        samples = [s.copy() if s._in_db else s for s in samples]

        if self.media_type is None and samples:
            self.media_type = _get_media_type(samples[0])

        if expand_schema:
            self._expand_schema(samples, dynamic)

        if validate:
            self._validate_samples(samples)

        dicts = [self._make_dict(sample) for sample in samples]

        try:
            # adds `_id` to each dict
            self._sample_collection.insert_many(dicts)
        except BulkWriteError as bwe:
            msg = bwe.details["writeErrors"][0]["errmsg"]
            raise ValueError(msg) from bwe

        for sample, d in zip(samples, dicts):
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)
            if sample.media_type == fom.VIDEO:
                sample.frames.save()

        return [str(d["_id"]) for d in dicts]

    def _upsert_samples(
        self,
        samples,
        expand_schema=True,
        dynamic=False,
        validate=True,
        num_samples=None,
    ):
        if num_samples is None:
            try:
                num_samples = len(samples)
            except:
                pass

        # Dynamically size batches so that they are as large as possible while
        # still achieving a nice frame rate on the progress bar
        batcher = fou.DynamicBatcher(
            samples,
            target_latency=0.2,
            init_batch_size=1,
            max_batch_beta=2.0,
            progress=True,
        )

        with batcher:
            for batch in batcher:
                self._upsert_samples_batch(
                    batch, expand_schema, dynamic, validate
                )

    def _upsert_samples_batch(self, samples, expand_schema, dynamic, validate):
        if self.media_type is None and samples:
            self.media_type = _get_media_type(samples[0])

        if expand_schema:
            self._expand_schema(samples, dynamic)

        if validate:
            self._validate_samples(samples)

        dicts = []
        ops = []
        for sample in samples:
            d = self._make_dict(sample, include_id=True)
            dicts.append(d)

            if sample.id:
                ops.append(ReplaceOne({"_id": sample._id}, d, upsert=True))
            else:
                d.pop("_id", None)
                ops.append(InsertOne(d))  # adds `_id` to dict

        foo.bulk_write(ops, self._sample_collection, ordered=False)

        for sample, d in zip(samples, dicts):
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)

            if sample.media_type == fom.VIDEO:
                sample.frames.save()

    def _make_dict(self, sample, include_id=False):
        d = sample.to_mongo_dict(include_id=include_id)

        # We omit None here to allow samples with None-valued new fields to
        # be added without raising nonexistent field errors. This is safe
        # because None and missing are equivalent in our data model
        return {k: v for k, v in d.items() if v is not None}

    def _bulk_write(self, ops, frames=False, ordered=False):
        if frames:
            coll = self._frame_collection
        else:
            coll = self._sample_collection

        foo.bulk_write(ops, coll, ordered=ordered)

        if frames:
            fofr.Frame._reload_docs(self._frame_collection_name)
        else:
            fos.Sample._reload_docs(self._sample_collection_name)

    def _merge_doc(
        self,
        doc,
        fields=None,
        omit_fields=None,
        expand_schema=True,
        merge_info=True,
        overwrite_info=False,
    ):
        if fields is not None:
            if etau.is_str(fields):
                fields = [fields]
            elif not isinstance(fields, dict):
                fields = list(fields)

        if omit_fields is not None:
            if etau.is_str(omit_fields):
                omit_fields = [omit_fields]
            else:
                omit_fields = list(omit_fields)

        _merge_dataset_doc(
            self,
            doc,
            fields=fields,
            omit_fields=omit_fields,
            expand_schema=expand_schema,
            merge_info=merge_info,
            overwrite_info=overwrite_info,
        )

    def merge_samples(
        self,
        samples,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        include_info=True,
        overwrite_info=False,
        num_samples=None,
    ):
        """Merges the given samples into this dataset.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the provided samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection` or
                iterable of :class:`fiftyone.core.sample.Sample` instances
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from ``samples``, if present, when merging or adding samples.
                One exception is that ``filepath`` is always included when
                adding new samples, since the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types.
                For label lists fields, existing
                :class:`fiftyone.core.label.Label` elements are either replaced
                (when ``overwrite`` is True) or kept (when ``overwrite`` is
                False) when their ``id`` matches a label from the provided
                samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered. Only applicable when
                ``samples`` is not a
                :class:`fiftyone.core.collections.SampleCollection`
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``. Only applicable when
                ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection`
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``samples`` is a
                :class:`fiftyone.core.collections.SampleCollection` and
                ``include_info`` is True
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed via ``len(samples)``, if possible.
                This value is optional and is used only for progress tracking
        """
        if fields is not None:
            if etau.is_str(fields):
                fields = [fields]
            elif not isinstance(fields, dict):
                fields = list(fields)

        if omit_fields is not None:
            if etau.is_str(omit_fields):
                omit_fields = [omit_fields]
            else:
                omit_fields = list(omit_fields)

        if isinstance(samples, foc.SampleCollection):
            _merge_dataset_doc(
                self,
                samples,
                fields=fields,
                omit_fields=omit_fields,
                expand_schema=expand_schema,
                merge_info=include_info,
                overwrite_info=overwrite_info,
            )

            expand_schema = False

        # If we're merging a collection, use aggregation pipelines
        if isinstance(samples, foc.SampleCollection) and key_fcn is None:
            _merge_samples_pipeline(
                samples,
                self,
                key_field,
                skip_existing=skip_existing,
                insert_new=insert_new,
                fields=fields,
                omit_fields=omit_fields,
                merge_lists=merge_lists,
                overwrite=overwrite,
            )
            return

        #
        # If we're not merging a collection but the merge key is a field, it's
        # faster to import into a temporary dataset and then do a merge that
        # leverages aggregation pipelines, because this avoids the need to
        # load samples from `self` into memory
        #

        if key_fcn is None:
            tmp = Dataset()

            try:
                tmp.add_samples(
                    samples, dynamic=dynamic, num_samples=num_samples
                )

                self.merge_samples(
                    tmp,
                    key_field=key_field,
                    skip_existing=skip_existing,
                    insert_new=insert_new,
                    fields=fields,
                    omit_fields=omit_fields,
                    merge_lists=merge_lists,
                    overwrite=overwrite,
                    expand_schema=expand_schema,
                    include_info=False,
                )
            finally:
                tmp.delete()

            return

        _merge_samples_python(
            self,
            samples,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            num_samples=num_samples,
        )

    def delete_samples(self, samples_or_ids):
        """Deletes the given sample(s) from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        Args:
            samples_or_ids: the sample(s) to delete. Can be any of the
                following:

                -   a sample ID
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
                -   a :class:`fiftyone.core.collections.SampleCollection`
        """
        sample_ids = _get_sample_ids(samples_or_ids)
        self._clear(sample_ids=sample_ids)

    def delete_frames(self, frames_or_ids):
        """Deletes the given frames(s) from the dataset.

        If reference to a frame exists in memory, the frame will be updated
        such that ``frame.in_dataset`` is False.

        Args:
            frames_or_ids: the frame(s) to delete. Can be any of the following:

                -   a frame ID
                -   an iterable of frame IDs
                -   a :class:`fiftyone.core.frame.Frame` or
                    :class:`fiftyone.core.frame.FrameView`
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` whose frames to
                    delete
                -   an iterable of :class:`fiftyone.core.frame.Frame` or
                    :class:`fiftyone.core.frame.FrameView` instances
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances whose
                    frames to delete
                -   a :class:`fiftyone.core.collections.SampleCollection` whose
                    frames to delete
        """
        frame_ids = _get_frame_ids(frames_or_ids)
        self._clear_frames(frame_ids=frame_ids)

    def delete_groups(self, groups_or_ids):
        """Deletes the given groups(s) from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        Args:
            groups_or_ids: the group(s) to delete. Can be any of the
                following:

                -   a group ID
                -   an iterable of group IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   a group dict returned by
                    :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
                -   an iterable of group dicts returned by
                    :meth:`get_group() <fiftyone.core.collections.SampleCollection.get_group>`
                -   a :class:`fiftyone.core.collections.SampleCollection`
        """
        group_ids = _get_group_ids(groups_or_ids)
        self._clear_groups(group_ids=group_ids)

    def delete_labels(
        self, labels=None, ids=None, tags=None, view=None, fields=None
    ):
        """Deletes the specified labels from the dataset.

        You can specify the labels to delete via any of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :meth:`fiftyone.core.session.Session.selected_labels`

        -   Provide the ``ids`` or ``tags`` arguments to specify the labels to
            delete via their IDs and/or tags

        -   Provide the ``view`` argument to delete all of the labels in a view
            into this dataset. This syntax is useful if you have constructed a
            :class:`fiftyone.core.view.DatasetView` defining the labels to
            delete

        Additionally, you can specify the ``fields`` argument to restrict
        deletion to specific field(s), either for efficiency or to ensure that
        labels from other fields are not deleted if their contents are included
        in the other arguments.

        Args:
            labels (None): a list of dicts specifying the labels to delete in
                the format returned by
                :meth:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to delete
            tags (None): a tag or iterable of tags of the labels to delete
            view (None): a :class:`fiftyone.core.view.DatasetView` into this
                dataset containing the labels to delete
            fields (None): a field or iterable of fields from which to delete
                labels
        """
        if labels is not None:
            self._delete_labels(labels, fields=fields)

        if ids is None and tags is None and view is None:
            return

        if view is not None and view._dataset is not self:
            raise ValueError("`view` must be a view into the same dataset")

        if etau.is_str(ids):
            ids = [ids]

        if ids is not None:
            ids = [ObjectId(_id) for _id in ids]

        if etau.is_str(tags):
            tags = [tags]

        if fields is None:
            fields = self._get_label_fields()
        elif etau.is_str(fields):
            fields = [fields]

        sample_ops = []
        frame_ops = []
        for field in fields:
            if view is not None:
                _, id_path = view._get_label_field_path(field, "_id")
                view_ids = view.values(id_path, unwind=True)
            else:
                view_ids = None

            label_type = self._get_label_field_type(field)
            field, is_frame_field = self._handle_frame_field(field)

            ops = []
            if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                array_field = field + "." + label_type._LABEL_LIST_FIELD

                if view_ids is not None:
                    ops.append(
                        UpdateMany(
                            {},
                            {
                                "$pull": {
                                    array_field: {"_id": {"$in": view_ids}}
                                }
                            },
                        )
                    )

                if ids is not None:
                    ops.append(
                        UpdateMany(
                            {}, {"$pull": {array_field: {"_id": {"$in": ids}}}}
                        )
                    )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {},
                            {
                                "$pull": {
                                    array_field: {
                                        "tags": {"$elemMatch": {"$in": tags}}
                                    }
                                }
                            },
                        )
                    )
            else:
                if view_ids is not None:
                    ops.append(
                        UpdateMany(
                            {field + "._id": {"$in": view_ids}},
                            {"$set": {field: None}},
                        )
                    )

                if ids is not None:
                    ops.append(
                        UpdateMany(
                            {field + "._id": {"$in": ids}},
                            {"$set": {field: None}},
                        )
                    )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {field + ".tags": {"$elemMatch": {"$in": tags}}},
                            {"$set": {field: None}},
                        )
                    )

            if is_frame_field:
                frame_ops.extend(ops)
            else:
                sample_ops.extend(ops)

        if sample_ops:
            foo.bulk_write(sample_ops, self._sample_collection)
            fos.Sample._reload_docs(self._sample_collection_name)

        if frame_ops:
            foo.bulk_write(frame_ops, self._frame_collection)
            fofr.Frame._reload_docs(self._frame_collection_name)

    def _delete_labels(self, labels, fields=None):
        if etau.is_str(fields):
            fields = [fields]

        # Partition labels by field
        sample_ids = set()
        labels_map = defaultdict(list)
        for l in labels:
            sample_ids.add(l["sample_id"])
            labels_map[l["field"]].append(l)

        sample_ops = []
        frame_ops = []
        for field, field_labels in labels_map.items():
            if fields is not None and field not in fields:
                continue

            label_type = self._get_label_field_type(field)
            field, is_frame_field = self._handle_frame_field(field)

            if is_frame_field:
                # Partition by (sample ID, frame number)
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[(l["sample_id"], l["frame_number"])].append(
                        ObjectId(l["label_id"])
                    )

                if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                    array_field = field + "." + label_type._LABEL_LIST_FIELD

                    for (
                        (sample_id, frame_number),
                        label_ids,
                    ) in _labels_map.items():
                        frame_ops.append(
                            UpdateOne(
                                {
                                    "_sample_id": ObjectId(sample_id),
                                    "frame_number": frame_number,
                                },
                                {
                                    "$pull": {
                                        array_field: {
                                            "_id": {"$in": label_ids}
                                        }
                                    }
                                },
                            )
                        )
                else:
                    for (
                        (sample_id, frame_number),
                        label_ids,
                    ) in _labels_map.items():
                        # If the data is well-formed, `label_ids` should have
                        # exactly one element, and this is redundant anyhow
                        # since `sample_id` should uniquely define the label to
                        # delete, but we still include `label_id` in the query
                        # just to be safe
                        for label_id in label_ids:
                            frame_ops.append(
                                UpdateOne(
                                    {
                                        "_sample_id": ObjectId(sample_id),
                                        "frame_number": frame_number,
                                        field + "._id": label_id,
                                    },
                                    {"$set": {field: None}},
                                )
                            )
            else:
                # Partition by sample ID
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[l["sample_id"]].append(ObjectId(l["label_id"]))

                if issubclass(label_type, fol._LABEL_LIST_FIELDS):
                    array_field = field + "." + label_type._LABEL_LIST_FIELD

                    for sample_id, label_ids in _labels_map.items():
                        sample_ops.append(
                            UpdateOne(
                                {"_id": ObjectId(sample_id)},
                                {
                                    "$pull": {
                                        array_field: {
                                            "_id": {"$in": label_ids}
                                        }
                                    }
                                },
                            )
                        )
                else:
                    for sample_id, label_ids in _labels_map.items():
                        # If the data is well-formed, `label_ids` should have
                        # exactly one element, and this is redundant anyhow
                        # since `sample_id` and `frame_number` should uniquely
                        # define the label to delete, but we still include
                        # `label_id` in the query just to be safe
                        for label_id in label_ids:
                            sample_ops.append(
                                UpdateOne(
                                    {
                                        "_id": ObjectId(sample_id),
                                        field + "._id": label_id,
                                    },
                                    {"$set": {field: None}},
                                )
                            )

        if sample_ops:
            foo.bulk_write(sample_ops, self._sample_collection)

            fos.Sample._reload_docs(
                self._sample_collection_name, sample_ids=sample_ids
            )

        if frame_ops:
            foo.bulk_write(frame_ops, self._frame_collection)

            # pylint: disable=unexpected-keyword-arg
            fofr.Frame._reload_docs(
                self._frame_collection_name, sample_ids=sample_ids
            )

    @deprecated(reason="Use delete_samples() instead")
    def remove_sample(self, sample_or_id):
        """Removes the given sample from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`delete_samples` instead.

        Args:
            sample_or_id: the sample to remove. Can be any of the following:

                -   a sample ID
                -   a :class:`fiftyone.core.sample.Sample`
                -   a :class:`fiftyone.core.sample.SampleView`
        """
        self.delete_samples(sample_or_id)

    @deprecated(reason="Use delete_samples() instead")
    def remove_samples(self, samples_or_ids):
        """Removes the given samples from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.

        .. warning::

            This method is deprecated and will be removed in a future release.
            Use the drop-in replacement :meth:`delete_samples` instead.

        Args:
            samples_or_ids: the samples to remove. Can be any of the following:

                -   a sample ID
                -   an iterable of sample IDs
                -   a :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView`
                -   an iterable of :class:`fiftyone.core.sample.Sample` or
                    :class:`fiftyone.core.sample.SampleView` instances
                -   a :class:`fiftyone.core.collections.SampleCollection`
        """
        self.delete_samples(samples_or_ids)

    def save(self):
        """Saves the dataset to the database.

        This only needs to be called when dataset-level information such as its
        :meth:`Dataset.info` is modified.
        """
        self._save()

    def _save(self, view=None, fields=None):
        if view is not None:
            _save_view(view, fields=fields)

        self._doc.save()

    def _save_field(self, field):
        if self._is_generated:
            raise ValueError(
                "Cannot save fields on generated views. Use the dataset's "
                "fields instead"
            )

        path, is_frame_field = self._handle_frame_field(field.path)
        if is_frame_field:
            field_doc = self._frame_doc_cls._get_field_doc(path)
        else:
            field_doc = self._sample_doc_cls._get_field_doc(path)

        field_doc.description = field.description
        field_doc.info = field.info

        try:
            self._doc.save(safe=True)
        except:
            self._reload(hard=True)
            raise

    @property
    def has_saved_views(self):
        """Whether this dataset has any saved views."""
        return bool(self.list_saved_views())

    def has_saved_view(self, name):
        """Whether this dataset has a saved view with the given name.

        Args:
            name: a saved view name

        Returns:
            True/False
        """
        return name in self.list_saved_views()

    def list_saved_views(self):
        """Returns the names of saved views on this dataset.

        Returns:
            a list of saved view names
        """
        return [view_doc.name for view_doc in self._doc.saved_views]

    def save_view(
        self,
        name=name,
        view=view,
        description=None,
        color=None,
        overwrite=False,
    ):
        """Saves the given view into this dataset under the given name so it
        can be loaded later via :meth:`load_saved_view`.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            view = dataset.filter_labels("ground_truth", F("label") == "cat")

            dataset.save_view("cats", view)

            also_view = dataset.load_saved_view("cats")
            assert view == also_view

        Args:
            name: a name for the saved view
            view: a :class:`fiftyone.core.view.DatasetView`
            overwrite (False): whether to overwrite an existing saved view with
                the same name
        """
        if view._root_dataset is not self:
            raise ValueError("Cannot save view into a different dataset")

        view._set_name(name)
        slug = self._validate_saved_view_name(name, overwrite=overwrite)

        now = datetime.utcnow()

        view_doc = foo.SavedViewDocument(
            dataset_id=self._doc.id,
            name=name,
            slug=slug,
            description=description,
            color=color,
            view_stages=[
                json_util.dumps(s)
                for s in view._serialize(include_uuids=False)
            ],
            created_at=now,
            last_modified_at=now,
        )
        view_doc.save()

        self._doc.saved_views.append(view_doc)
        self._doc.save()

    def get_saved_view_info(self, name):
        """Loads the editable information about the saved view with the given
        name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            view = dataset.limit(10)
            dataset.save_view("test", view)

            print(dataset.get_saved_view_info("test"))

        Args:
            name: the name of a saved view

        Returns:
            a dict of editable info
        """
        view_doc = self._get_saved_view_doc(name)
        return {f: view_doc[f] for f in view_doc._EDITABLE_FIELDS}

    def update_saved_view_info(self, name, info):
        """Updates the editable information for the saved view with the given
        name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            view = dataset.limit(10)
            dataset.save_view("test", view)

            # Update the saved view's name and add a description
            info = dict(
                name="a new name",
                description="a description",
            )
            dataset.update_saved_view_info("test", info)

        Args:
            name: the name of a saved view
            info: a dict whose keys are a subset of the keys returned by
                :meth:`get_saved_view_info`
        """
        view_doc = self._get_saved_view_doc(name)

        invalid_fields = set(info.keys()) - set(view_doc._EDITABLE_FIELDS)
        if invalid_fields:
            raise ValueError("Cannot edit fields %s" % invalid_fields)

        edited = False
        for key, value in info.items():
            if value != view_doc[key]:
                if key == "name":
                    slug = self._validate_saved_view_name(value, skip=view_doc)
                    view_doc.slug = slug

                view_doc[key] = value
                edited = True

        if edited:
            view_doc.last_modified_at = datetime.utcnow()
            view_doc.save()

    def load_saved_view(
        self,
        name,
    ):
        """Loads the saved view with the given name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")
            view = dataset.filter_labels("ground_truth", F("label") == "cat")

            dataset.save_view("cats", view)

            also_view = dataset.load_saved_view("cats")
            assert view == also_view

        Args:
            name: the name of a saved view

        Returns:
            a :class:`fiftyone.core.view.DatasetView`
        """
        view_doc = self._get_saved_view_doc(name)
        view = self._load_saved_view_from_doc(view_doc)

        view_doc.last_loaded_at = datetime.utcnow()
        view_doc.save()

        return view

    def delete_saved_view(self, name):
        """Deletes the saved view with the given name.

        Args:
            name: the name of a saved view
        """
        view_doc = self._get_saved_view_doc(name, pop=True)
        deleted_id = view_doc.id

        view_doc.delete()
        self._doc.save()
        return str(deleted_id)

    def delete_saved_views(self):
        """Deletes all saved views from this dataset."""
        for view_doc in self._doc.saved_views:
            view_doc.delete()

        self._doc.saved_views = []
        self._doc.save()

    def _get_saved_view_doc(self, name, pop=False, slug=False):
        idx = None
        key = "slug" if slug else "name"

        for i, view_doc in enumerate(self._doc.saved_views):
            if name == getattr(view_doc, key):
                idx = i
                break

        if idx is None:
            raise ValueError("Dataset has no saved view '%s'" % name)

        if pop:
            return self._doc.saved_views.pop(idx)

        return self._doc.saved_views[idx]

    def _load_saved_view_from_doc(self, view_doc):
        stage_dicts = [json_util.loads(s) for s in view_doc.view_stages]
        name = getattr(view_doc, "name")
        view = fov.DatasetView._build(self, stage_dicts)
        view._set_name(name)
        return view

    def _validate_saved_view_name(self, name, skip=None, overwrite=False):
        slug = fou.to_slug(name)
        for view_doc in self._doc.saved_views:
            if view_doc is skip:
                continue

            if name == view_doc.name or slug == view_doc.slug:
                dup_name = view_doc.name

                if not overwrite:
                    raise ValueError(
                        "Saved view with name '%s' already exists" % dup_name
                    )

                self.delete_saved_view(dup_name)

        return slug

    def clone(self, name=None, persistent=False):
        """Creates a copy of the dataset.

        Dataset clones contain deep copies of all samples and dataset-level
        information in the source dataset. The source *media files*, however,
        are not copied.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the cloned dataset should be persistent

        Returns:
            the new :class:`Dataset`
        """
        return self._clone(name=name, persistent=persistent)

    def _clone(self, name=None, persistent=False, view=None):
        if name is None:
            name = get_default_dataset_name()

        if view is not None:
            sample_collection = view
        else:
            sample_collection = self

        return _clone_dataset_or_view(sample_collection, name, persistent)

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.
        """
        self._clear()

    def _clear(self, view=None, sample_ids=None):
        if view is not None:
            contains_videos = view._contains_videos(any_slice=True)

            if view.media_type == fom.GROUP:
                view = view.select_group_slices(_allow_mixed=True)

            sample_ids = view.values("id")
        else:
            contains_videos = self._contains_videos(any_slice=True)

        if sample_ids is not None:
            d = {"_id": {"$in": [ObjectId(_id) for _id in sample_ids]}}
        else:
            d = {}

        self._sample_collection.delete_many(d)
        fos.Sample._reset_docs(
            self._sample_collection_name, sample_ids=sample_ids
        )

        if contains_videos:
            self._clear_frames(sample_ids=sample_ids)

    def _clear_groups(self, view=None, group_ids=None):
        if self.group_field is None:
            raise ValueError("%s has no group field" % type(self))

        if view is not None:
            if view.media_type != fom.GROUP:
                raise ValueError("DatasetView is not grouped")

            group_ids = set(view.values(view.group_field + ".id"))

        if group_ids is not None:
            if self.media_type != fom.GROUP:
                raise ValueError("Dataset is not grouped")

            F = foe.ViewField
            oids = [ObjectId(_id) for _id in group_ids]
            view = self.select_group_slices(_allow_mixed=True).match(
                F(self.group_field + "._id").is_in(oids)
            )
            sample_ids = view.values("id")
        else:
            sample_ids = None

        self._clear(sample_ids=sample_ids)

    def _keep(self, view=None, sample_ids=None):
        if self.media_type == fom.GROUP:
            clear_view = self.select_group_slices(_allow_mixed=True)
        else:
            clear_view = self.view()

        if view is not None:
            if view.media_type == fom.GROUP:
                view = view.select_group_slices(_allow_mixed=True)

            clear_view = clear_view.exclude(view)
        elif sample_ids is not None:
            clear_view = clear_view.exclude(sample_ids)
        else:
            clear_view = None

        self._clear(view=clear_view)

    def _keep_fields(self, view=None):
        if view is None:
            return

        del_sample_fields = view._get_missing_fields()
        if del_sample_fields:
            self.delete_sample_fields(del_sample_fields)

        if self._has_frame_fields():
            del_frame_fields = view._get_missing_fields(frames=True)
            if del_frame_fields:
                self.delete_frame_fields(del_frame_fields)

    def clear_frames(self):
        """Removes all frame labels from the dataset.

        If reference to a frame exists in memory, the frame will be updated
        such that ``frame.in_dataset`` is False.
        """
        self._clear_frames()

    def _clear_frames(self, view=None, sample_ids=None, frame_ids=None):
        sample_collection = view if view is not None else self
        if not sample_collection._contains_videos(any_slice=True):
            return

        if self._is_clips:
            if sample_ids is not None:
                view = self.select(sample_ids)
            elif frame_ids is None and view is None:
                view = self

            if view is not None:
                frame_ids = view.values("frames.id", unwind=True)

        if frame_ids is not None:
            self._frame_collection.delete_many(
                {"_id": {"$in": [ObjectId(_id) for _id in frame_ids]}}
            )
            fofr.Frame._reset_docs_by_frame_id(
                self._frame_collection_name, frame_ids
            )
            return

        if view is not None:
            if view.media_type == fom.GROUP:
                view = view.select_group_slices(media_type=fom.VIDEO)

            sample_ids = view.values("id")

        if sample_ids is not None:
            d = {"_sample_id": {"$in": [ObjectId(_id) for _id in sample_ids]}}
        else:
            d = {}

        self._frame_collection.delete_many(d)
        fofr.Frame._reset_docs(
            self._frame_collection_name, sample_ids=sample_ids
        )

    def _keep_frames(self, view=None, frame_ids=None):
        sample_collection = view if view is not None else self
        if not sample_collection._contains_videos(any_slice=True):
            return

        if self._is_clips:
            if frame_ids is None and view is None:
                view = self

            if view is not None:
                frame_ids = view.values("frames.id", unwind=True)

        if frame_ids is not None:
            self._frame_collection.delete_many(
                {
                    "_id": {
                        "$not": {"$in": [ObjectId(_id) for _id in frame_ids]}
                    }
                }
            )
            fofr.Frame._reset_docs_by_frame_id(
                self._frame_collection_name, frame_ids, keep=True
            )
            return

        if view is None:
            return

        if view.media_type == fom.GROUP:
            view = view.select_group_slices(media_type=fom.VIDEO)

        sample_ids, frame_numbers = view.values(["id", "frames.frame_number"])

        ops = []
        for sample_id, fns in zip(sample_ids, frame_numbers):
            ops.append(
                DeleteMany(
                    {
                        "_sample_id": ObjectId(sample_id),
                        "frame_number": {"$not": {"$in": fns}},
                    }
                )
            )

        if not ops:
            return

        foo.bulk_write(ops, self._frame_collection)
        for sample_id, fns in zip(sample_ids, frame_numbers):
            fofr.Frame._reset_docs_for_sample(
                self._frame_collection_name, sample_id, fns, keep=True
            )

    def ensure_frames(self):
        """Ensures that the video dataset contains frame instances for every
        frame of each sample's source video.

        Empty frames will be inserted for missing frames, and already existing
        frames are left unchanged.
        """
        self._ensure_frames()

    def _ensure_frames(self, view=None):
        if not self._has_frame_fields():
            return

        if view is not None:
            sample_collection = view
        else:
            sample_collection = self

        if sample_collection.media_type == fom.GROUP:
            sample_collection = sample_collection.select_group_slices(
                media_type=fom.VIDEO
            )

        sample_collection.compute_metadata()
        sample_collection._aggregate(
            post_pipeline=[
                {
                    "$project": {
                        "_id": False,
                        "_sample_id": "$_id",
                        "frame_number": {
                            "$range": [
                                1,
                                {"$add": ["$metadata.total_frame_count", 1]},
                            ]
                        },
                    }
                },
                {"$unwind": "$frame_number"},
                {
                    "$merge": {
                        "into": self._frame_collection_name,
                        "on": ["_sample_id", "frame_number"],
                        "whenMatched": "keepExisting",
                        "whenNotMatched": "insert",
                    }
                },
            ]
        )

    def delete(self):
        """Deletes the dataset.

        Once deleted, only the ``name`` and ``deleted`` attributes of a dataset
        may be accessed.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.
        """
        self._sample_collection.drop()
        fos.Sample._reset_docs(self._sample_collection_name)

        # Clips datasets directly inherit frames from source dataset
        if not self._is_clips:
            self._frame_collection.drop()
            fofr.Frame._reset_docs(self._frame_collection_name)

        # Update singleton
        self._instances.pop(self._doc.name, None)

        _delete_dataset_doc(self._doc)
        self._deleted = True

    def add_dir(
        self,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        **kwargs,
    ):
        """Adds the contents of the given directory to the dataset.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        Args:
            dataset_dir (None): the dataset directory. This can be omitted for
                certain dataset formats if you provide arguments such as
                ``data_path`` and ``labels_path``
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        dataset_importer, _ = foud.build_dataset_importer(
            dataset_type,
            dataset_dir=dataset_dir,
            data_path=data_path,
            labels_path=labels_path,
            name=self.name,
            **kwargs,
        )

        return self.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
        )

    def merge_dir(
        self,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        **kwargs,
    ):
        """Merges the contents of the given directory into the dataset.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            dataset_dir (None): the dataset directory. This can be omitted for
                certain dataset formats if you provide arguments such as
                ``data_path`` and ``labels_path``
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``
        """
        dataset_importer, _ = foud.build_dataset_importer(
            dataset_type,
            dataset_dir=dataset_dir,
            data_path=data_path,
            labels_path=labels_path,
            name=self.name,
            **kwargs,
        )

        return self.merge_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
        )

    def add_archive(
        self,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        cleanup=True,
        **kwargs,
    ):
        """Adds the contents of the given archive to the dataset.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        dataset_dir = _extract_archive_if_necessary(archive_path, cleanup)
        return self.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
            **kwargs,
        )

    def merge_archive(
        self,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        cleanup=True,
        **kwargs,
    ):
        """Merges the contents of the given archive into the dataset.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``
        """
        dataset_dir = _extract_archive_if_necessary(archive_path, cleanup)
        return self.merge_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
            **kwargs,
        )

    def add_importer(
        self,
        dataset_importer,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        add_info=True,
    ):
        """Adds the samples from the given
        :class:`fiftyone.utils.data.importers.DatasetImporter` to the dataset.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        importing datasets in custom formats by defining your own
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`.

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer (if
                any) to the dataset's ``info``

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.import_samples(
            self,
            dataset_importer,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
        )

    def merge_importer(
        self,
        dataset_importer,
        label_field=None,
        tags=None,
        key_field="filepath",
        key_fcn=None,
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
    ):
        """Merges the samples from the given
        :class:`fiftyone.utils.data.importers.DatasetImporter` into the
        dataset.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        importing datasets in custom formats by defining your own
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`.

        By default, samples with the same absolute ``filepath`` are merged, but
        you can customize this behavior via the ``key_field`` and ``key_fcn``
        parameters. For example, you could set
        ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
        samples with the same base filename.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the imported samples are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both collections are updated
        rather than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether existing samples should be modified or skipped
        -   Whether new samples should be added or omitted
        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input fields to different field names of this dataset

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            key_fcn (None): a function that accepts a
                :class:`fiftyone.core.sample.Sample` instance and computes a
                key to decide if two samples should be merged. If a ``key_fcn``
                is provided, ``key_field`` is ignored
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. If provided, fields other than these are
                omitted from ``samples`` when merging or adding samples. One
                exception is that ``filepath`` is always included when adding
                new samples, since the field is required. This can also be a
                dict mapping field names of the input collection to field names
                of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. If provided, these fields are omitted
                from imported samples, if present. One exception is that
                ``filepath`` is always included when adding new samples, since
                the field is required
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types. For
                label lists fields, existing :class:`fiftyone.core.label.Label`
                elements are either replaced (when ``overwrite`` is True) or
                kept (when ``overwrite`` is False) when their ``id`` matches a
                label from the provided samples
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
        """
        return foud.merge_samples(
            self,
            dataset_importer,
            label_field=label_field,
            tags=tags,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
        )

    def add_images(self, paths_or_samples, sample_parser=None, tags=None):
        """Adds the given images to the dataset.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding images to a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        return foud.add_images(
            self, paths_or_samples, sample_parser, tags=tags
        )

    def add_labeled_images(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
    ):
        """Adds the given labeled images to the dataset.

        This operation will iterate over all provided samples, but the images
        will not be read (unless the sample parser requires it in order to
        compute image metadata).

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding labeled images to a dataset by defining your own
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument can be either a string prefix
                to prepend to each label key or a dict mapping label keys to
                field names; the default in this case is to directly use the
                keys of the imported label dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.add_labeled_images(
            self,
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
        )

    def add_images_dir(self, images_dir, tags=None, recursive=True):
        """Adds the given directory of images to the dataset.

        See :class:`fiftyone.types.ImageDirectory` for format details. In
        particular, note that files with non-image MIME types are omitted.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = foud.parse_images_dir(images_dir, recursive=recursive)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(image_paths, sample_parser, tags=tags)

    def add_images_patt(self, images_patt, tags=None):
        """Adds the given glob pattern of images to the dataset.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = etau.get_glob_matches(images_patt)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(image_paths, sample_parser, tags=tags)

    def ingest_images(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        dataset_dir=None,
        image_format=None,
    ):
        """Ingests the given iterable of images into the dataset.

        The images are read in-memory and written to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting images into a dataset by defining your own
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            image_format (None): the image format to use to write the images to
                disk. By default, ``fiftyone.config.default_image_ext`` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.UnlabeledImageDatasetIngestor(
            dataset_dir,
            paths_or_samples,
            sample_parser,
            image_format=image_format,
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_images(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        dataset_dir=None,
        image_format=None,
    ):
        """Ingests the given iterable of labeled image samples into the
        dataset.

        The images are read in-memory and written to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting labeled images into a dataset by defining your own
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument can be either a string prefix
                to prepend to each label key or a dict mapping label keys to
                field names; the default in this case is to directly use the
                keys of the imported label dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            dataset_dir (None): the directory in which the images will be
                written. By default, :func:`get_default_dataset_dir` is used
            image_format (None): the image format to use to write the images to
                disk. By default, ``fiftyone.config.default_image_ext`` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledImageDatasetIngestor(
            dataset_dir,
            samples,
            sample_parser,
            image_format=image_format,
        )

        return self.add_importer(
            dataset_ingestor,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
        )

    def add_videos(self, paths_or_samples, sample_parser=None, tags=None):
        """Adds the given videos to the dataset.

        This operation does not read the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding videos to a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        return foud.add_videos(
            self, paths_or_samples, sample_parser, tags=tags
        )

    def add_labeled_videos(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
    ):
        """Adds the given labeled videos to the dataset.

        This operation will iterate over all provided samples, but the videos
        will not be read/decoded/etc.

        See :ref:`this guide <custom-sample-parser>` for more details about
        adding labeled videos to a dataset by defining your own
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the parser produces a
                dictionary of labels per sample/frame, this argument can be
                either a string prefix to prepend to each label key or a dict
                mapping label keys to field names; the default in this case is
                to directly use the keys of the imported label dictionaries as
                field names
            label_field ("ground_truth"): the name (or root name) of the
                frame field(s) to use for the labels
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        return foud.add_labeled_videos(
            self,
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
        )

    def add_videos_dir(self, videos_dir, tags=None, recursive=True):
        """Adds the given directory of videos to the dataset.

        See :class:`fiftyone.types.VideoDirectory` for format details. In
        particular, note that files with non-video MIME types are omitted.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = foud.parse_videos_dir(videos_dir, recursive=recursive)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(video_paths, sample_parser, tags=tags)

    def add_videos_patt(self, videos_patt, tags=None):
        """Adds the given glob pattern of videos to the dataset.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = etau.get_glob_matches(videos_patt)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(video_paths, sample_parser, tags=tags)

    def ingest_videos(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        dataset_dir=None,
    ):
        """Ingests the given iterable of videos into the dataset.

        The videos are copied to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting videos into a dataset by defining your own
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dataset_dir (None): the directory in which the videos will be
                written. By default, :func:`get_default_dataset_dir` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.UnlabeledVideoDatasetIngestor(
            dataset_dir, paths_or_samples, sample_parser
        )

        return self.add_importer(dataset_ingestor, tags=tags)

    def ingest_labeled_videos(
        self,
        samples,
        sample_parser,
        tags=None,
        expand_schema=True,
        dynamic=False,
        dataset_dir=None,
    ):
        """Ingests the given iterable of labeled video samples into the
        dataset.

        The videos are copied to ``dataset_dir``.

        See :ref:`this guide <custom-sample-parser>` for more details about
        ingesting labeled videos into a dataset by defining your own
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            expand_schema (True): whether to dynamically add new sample fields
                encountered to the dataset schema. If False, an error is raised
                if the sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            dataset_dir (None): the directory in which the videos will be
                written. By default, :func:`get_default_dataset_dir` is used

        Returns:
            a list of IDs of the samples in the dataset
        """
        if dataset_dir is None:
            dataset_dir = get_default_dataset_dir(self.name)

        dataset_ingestor = foud.LabeledVideoDatasetIngestor(
            dataset_dir, samples, sample_parser
        )

        return self.add_importer(
            dataset_ingestor,
            tags=tags,
            expand_schema=expand_schema,
            dynamic=dynamic,
        )

    @classmethod
    def from_dir(
        cls,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        name=None,
        label_field=None,
        tags=None,
        dynamic=False,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given directory.

        You can create datasets with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-datasets-from-disk>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized
            import. This syntax provides the flexibility to, for example,
            perform labels-only imports or imports where the source media lies
            in a different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        Args:
            dataset_dir (None): the dataset directory. This can be omitted if
                you provide arguments such as ``data_path`` and ``labels_path``
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``export_dir`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``dataset_dir`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``dataset_dir`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``dataset_dir`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in ``dataset_dir``
                    of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``dataset_dir`` has no effect on the
                    location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``dataset_dir`` of the labels for the default layout of the
                dataset type being imported
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_archive(
        cls,
        archive_path,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        name=None,
        label_field=None,
        tags=None,
        dynamic=False,
        cleanup=True,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given archive.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-datasets-from-disk>` for example usages
        of this method and descriptions of the available dataset types.

        .. note::

            The following archive formats are explicitly supported::

                .zip, .tar, .tar.gz, .tgz, .tar.bz, .tbz

            If an archive *not* in the above list is found, extraction will be
            attempted via the ``patool`` package, which supports many formats
            but may require that additional system packages be installed.

        Args:
            archive_path: the path to an archive of a dataset directory
            dataset_type (None): the :class:`fiftyone.types.Dataset` type of
                the dataset in ``archive_path``
            data_path (None): an optional parameter that enables explicit
                control over the location of the media for certain dataset
                types. Can be any of the following:

                -   a folder name like ``"data"`` or ``"data/"`` specifying a
                    subfolder of ``dataset_dir`` in which the media lies
                -   an absolute directory path in which the media lies. In this
                    case, the ``archive_path`` has no effect on the location of
                    the data
                -   a filename like ``"data.json"`` specifying the filename of
                    a JSON manifest file in ``archive_path`` that maps UUIDs to
                    media filepaths. Files of this format are generated when
                    passing the ``export_media="manifest"`` option to
                    :meth:`fiftyone.core.collections.SampleCollection.export`
                -   an absolute filepath to a JSON manifest file. In this case,
                    ``archive_path`` has no effect on the location of the data
                -   a dict mapping filenames to absolute filepaths

                By default, it is assumed that the data can be located in the
                default location within ``archive_path`` for the dataset type
            labels_path (None): an optional parameter that enables explicit
                control over the location of the labels. Only applicable when
                importing certain labeled dataset formats. Can be any of the
                following:

                -   a type-specific folder name like ``"labels"`` or
                    ``"labels/"`` or a filename like ``"labels.json"`` or
                    ``"labels.xml"`` specifying the location in
                    ``archive_path`` of the labels file(s)
                -   an absolute directory or filepath containing the labels
                    file(s). In this case, ``archive_path`` has no effect on
                    the location of the labels

                For labeled datasets, this parameter defaults to the location
                in ``archive_path`` of the labels for the default layout of the
                dataset type being imported
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            cleanup (True): whether to delete the archive after extracting it
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_archive(
            archive_path,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            cleanup=cleanup,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_importer(
        cls,
        dataset_importer,
        name=None,
        label_field=None,
        tags=None,
        dynamic=False,
    ):
        """Creates a :class:`Dataset` by importing the samples in the given
        :class:`fiftyone.utils.data.importers.DatasetImporter`.

        See :ref:`this guide <custom-dataset-importer>` for more details about
        providing a custom
        :class:`DatasetImporter <fiftyone.utils.data.importers.DatasetImporter>`
        to import datasets into FiftyOne.

        Args:
            dataset_importer: a
                :class:`fiftyone.utils.data.importers.DatasetImporter`
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. Only applicable if ``dataset_importer`` is a
                :class:`fiftyone.utils.data.importers.LabeledImageDatasetImporter` or
                :class:`fiftyone.utils.data.importers.LabeledVideoDatasetImporter`.
                If the importer produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the importer produces a
                dictionary of labels per sample, this argument can be either a
                string prefix to prepend to each label key or a dict mapping
                label keys to field names; the default in this case is to
                directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
        )
        return dataset

    @classmethod
    def from_images(
        cls, paths_or_samples, sample_parser=None, name=None, tags=None
    ):
        """Creates a :class:`Dataset` from the given images.

        This operation does not read the images.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledImageSampleParser <fiftyone.utils.data.parsers.UnlabeledImageSampleParser>`
        to load image samples into FiftyOne.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of image paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images(
            paths_or_samples, sample_parser=sample_parser, tags=tags
        )
        return dataset

    @classmethod
    def from_labeled_images(
        cls,
        samples,
        sample_parser,
        name=None,
        label_field=None,
        tags=None,
        dynamic=False,
    ):
        """Creates a :class:`Dataset` from the given labeled images.

        This operation will iterate over all provided samples, but the images
        will not be read.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`LabeledImageSampleParser <fiftyone.utils.data.parsers.LabeledImageSampleParser>`
        to load labeled image samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledImageSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample, this
                argument specifies the name of the field to use; the default is
                ``"ground_truth"``. If the parser produces a dictionary of
                labels per sample, this argument can be either a string prefix
                to prepend to each label key or a dict mapping label keys to
                field names; the default in this case is to directly use the
                keys of the imported label dictionaries as field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_labeled_images(
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
        )
        return dataset

    @classmethod
    def from_images_dir(cls, images_dir, name=None, tags=None, recursive=True):
        """Creates a :class:`Dataset` from the given directory of images.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images_dir(images_dir, tags=tags, recursive=recursive)
        return dataset

    @classmethod
    def from_images_patt(cls, images_patt, name=None, tags=None):
        """Creates a :class:`Dataset` from the given glob pattern of images.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_images_patt(images_patt, tags=tags)
        return dataset

    @classmethod
    def from_videos(
        cls, paths_or_samples, sample_parser=None, name=None, tags=None
    ):
        """Creates a :class:`Dataset` from the given videos.

        This operation does not read/decode the videos.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`UnlabeledVideoSampleParser <fiftyone.utils.data.parsers.UnlabeledVideoSampleParser>`
        to load video samples into FiftyOne.

        Args:
            paths_or_samples: an iterable of data. If no ``sample_parser`` is
                provided, this must be an iterable of video paths. If a
                ``sample_parser`` is provided, this can be an arbitrary
                iterable whose elements can be parsed by the sample parser
            sample_parser (None): a
                :class:`fiftyone.utils.data.parsers.UnlabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos(
            paths_or_samples, sample_parser=sample_parser, tags=tags
        )
        return dataset

    @classmethod
    def from_labeled_videos(
        cls,
        samples,
        sample_parser,
        name=None,
        label_field=None,
        tags=None,
        dynamic=False,
    ):
        """Creates a :class:`Dataset` from the given labeled videos.

        This operation will iterate over all provided samples, but the videos
        will not be read/decoded/etc.

        See :ref:`this guide <custom-sample-parser>` for more details about
        providing a custom
        :class:`LabeledVideoSampleParser <fiftyone.utils.data.parsers.LabeledVideoSampleParser>`
        to load labeled video samples into FiftyOne.

        Args:
            samples: an iterable of data
            sample_parser: a
                :class:`fiftyone.utils.data.parsers.LabeledVideoSampleParser`
                instance to use to parse the samples
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            label_field (None): controls the field(s) in which imported labels
                are stored. If the parser produces a single
                :class:`fiftyone.core.labels.Label` instance per sample/frame,
                this argument specifies the name of the field to use; the
                default is ``"ground_truth"``. If the parser produces a
                dictionary of labels per sample/frame, this argument can be
                either a string prefix to prepend to each label key or a dict
                mapping label keys to field names; the default in this case is
                to directly use the keys of the imported label dictionaries as
                field names
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_labeled_videos(
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
        )
        return dataset

    @classmethod
    def from_videos_dir(cls, videos_dir, name=None, tags=None, recursive=True):
        """Creates a :class:`Dataset` from the given directory of videos.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos_dir(videos_dir, tags=tags, recursive=recursive)
        return dataset

    @classmethod
    def from_videos_patt(cls, videos_patt, name=None, tags=None):
        """Creates a :class:`Dataset` from the given glob pattern of videos.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name)
        dataset.add_videos_patt(videos_patt, tags=tags)
        return dataset

    @classmethod
    def from_dict(cls, d, name=None, rel_dir=None, frame_labels_dir=None):
        """Loads a :class:`Dataset` from a JSON dictionary generated by
        :meth:`fiftyone.core.collections.SampleCollection.to_dict`.

        The JSON dictionary can contain an export of any
        :class:`fiftyone.core.collections.SampleCollection`, e.g.,
        :class:`Dataset` or :class:`fiftyone.core.view.DatasetView`.

        Args:
            d: a JSON dictionary
            name (None): a name for the new dataset
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via :func:`fiftyone.core.utils.normalize_path`
            frame_labels_dir (None): a directory of per-sample JSON files
                containing the frame labels for video samples. If omitted, it
                is assumed that the frame labels are included directly in the
                provided JSON dict. Only applicable to datasets that contain
                videos

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = d.get("name", None)
            if name is None:
                raise ValueError("Attempting to load a Dataset with no name.")

        if rel_dir is not None:
            rel_dir = fou.normalize_path(rel_dir)

        name = make_unique_dataset_name(name)
        dataset = cls(name)

        media_type = d.get("media_type", None)
        if media_type is not None:
            dataset.media_type = media_type

        if media_type == fom.GROUP:
            # group_field and group_slice are inferred when adding samples
            dataset._doc.group_media_types = d.get("group_media_types", {})
            dataset._doc.default_group_slice = d.get(
                "default_group_slice", None
            )
            dataset.save()

        dataset._apply_field_schema(d.get("sample_fields", {}))

        if "frame_fields" in d:
            if media_type == fom.GROUP:
                dataset._declare_frame_fields()

            dataset._apply_frame_field_schema(d["frame_fields"])

        dataset._doc.info = d.get("info", {})

        dataset._doc.classes = d.get("classes", {})
        dataset._doc.default_classes = d.get("default_classes", [])

        dataset._doc.mask_targets = dataset._parse_mask_targets(
            d.get("mask_targets", {})
        )
        dataset._doc.default_mask_targets = (
            dataset._parse_default_mask_targets(
                d.get("default_mask_targets", {})
            )
        )

        dataset._doc.skeletons = dataset._parse_skeletons(
            d.get("skeletons", {})
        )
        dataset._doc.default_skeleton = dataset._parse_default_skeleton(
            d.get("default_skeleton", None)
        )

        dataset.save()

        def parse_sample(sd):
            if rel_dir and not os.path.isabs(sd["filepath"]):
                sd["filepath"] = os.path.join(rel_dir, sd["filepath"])

            if (media_type == fom.VIDEO) or (
                media_type == fom.GROUP
                and fom.get_media_type(sd["filepath"]) == fom.VIDEO
            ):
                frames = sd.pop("frames", {})

                if etau.is_str(frames):
                    frames_path = os.path.join(frame_labels_dir, frames)
                    frames = etas.load_json(frames_path).get("frames", {})

                sample = fos.Sample.from_dict(sd)

                for key, value in frames.items():
                    sample.frames[int(key)] = fofr.Frame.from_dict(value)
            else:
                sample = fos.Sample.from_dict(sd)

            return sample

        samples = d["samples"]
        _samples = map(parse_sample, samples)

        dataset.add_samples(
            _samples, expand_schema=False, num_samples=len(samples)
        )

        return dataset

    @classmethod
    def from_json(
        cls, path_or_str, name=None, rel_dir=None, frame_labels_dir=None
    ):
        """Loads a :class:`Dataset` from JSON generated by
        :func:`fiftyone.core.collections.SampleCollection.write_json` or
        :func:`fiftyone.core.collections.SampleCollection.to_json`.

        The JSON file can contain an export of any
        :class:`fiftyone.core.collections.SampleCollection`, e.g.,
        :class:`Dataset` or :class:`fiftyone.core.view.DatasetView`.

        Args:
            path_or_str: the path to a JSON file on disk or a JSON string
            name (None): a name for the new dataset
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample, if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via :func:`fiftyone.core.utils.normalize_path`

        Returns:
            a :class:`Dataset`
        """
        d = etas.load_json(path_or_str)
        return cls.from_dict(
            d, name=name, rel_dir=rel_dir, frame_labels_dir=frame_labels_dir
        )

    def _add_view_stage(self, stage):
        return self.view().add_stage(stage)

    def _pipeline(
        self,
        pipeline=None,
        media_type=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
        support=None,
        group_slice=None,
        group_slices=None,
        detach_groups=False,
        groups_only=False,
        manual_group_select=False,
        post_pipeline=None,
    ):
        if media_type is None:
            media_type = self.media_type

        if group_slice is None:
            group_slice = self.group_slice

        if media_type == fom.VIDEO:
            contains_videos = True
        else:
            contains_videos = self._contains_videos(any_slice=True)

        if not contains_videos:
            attach_frames = False
            detach_frames = False
            frames_only = False

        # We check for exactly False here, because `attach_frames == None` is a
        # special syntax that means that frames were already attached
        if attach_frames == False:
            if frames_only:
                attach_frames = True

            detach_frames = False

        if frames_only:
            detach_frames = False

        if media_type != fom.GROUP:
            group_slices = None
            detach_groups = False
            groups_only = False

        if groups_only:
            detach_groups = False

        _pipeline = []

        # If this is a grouped dataset, always start the pipeline by selecting
        # `group_slice`, unless the caller manually overrides this
        if self.media_type == fom.GROUP and not manual_group_select:
            _pipeline.extend(self._group_select_pipeline(group_slice))

        if attach_frames:
            _pipeline.extend(self._attach_frames_pipeline(support=support))

        if pipeline is not None:
            _pipeline.extend(pipeline)

        if detach_frames:
            _pipeline.append({"$project": {"frames": False}})
        elif frames_only:
            _pipeline.extend(self._unwind_frames_pipeline())

        if detach_groups:
            _pipeline.append({"$project": {"groups": False}})
        elif groups_only:
            _pipeline.extend(
                self._groups_only_pipeline(group_slices=group_slices)
            )

        if post_pipeline is not None:
            _pipeline.extend(post_pipeline)

        return _pipeline

    def _attach_frames_pipeline(self, support=None):
        """A pipeline that attaches the frame documents for each document."""
        if self._is_clips:
            first = {"$arrayElemAt": ["$support", 0]}
            last = {"$arrayElemAt": ["$support", 1]}

            if support is not None:
                first = {"$max": [first, support[0]]}
                last = {"$min": [last, support[1]]}

            let = {"sample_id": "$_sample_id", "first": first, "last": last}
            match_expr = {
                "$and": [
                    {"$eq": ["$$sample_id", "$_sample_id"]},
                    {"$gte": ["$frame_number", "$$first"]},
                    {"$lte": ["$frame_number", "$$last"]},
                ]
            }
        elif support is not None:
            let = {"sample_id": "$_id"}
            match_expr = {
                "$and": [
                    {"$eq": ["$$sample_id", "$_sample_id"]},
                    {"$gte": ["$frame_number", support[0]]},
                    {"$lte": ["$frame_number", support[1]]},
                ]
            }
        else:
            let = {"sample_id": "$_id"}
            match_expr = {"$eq": ["$$sample_id", "$_sample_id"]}

        return [
            {
                "$lookup": {
                    "from": self._frame_collection_name,
                    "let": let,
                    "pipeline": [
                        {"$match": {"$expr": match_expr}},
                        {"$sort": {"frame_number": 1}},
                    ],
                    "as": "frames",
                }
            }
        ]

    def _unwind_frames_pipeline(self):
        """A pipeline that returns (only) the unwound ``frames`` documents."""
        return [
            {"$unwind": "$frames"},
            {"$replaceRoot": {"newRoot": "$frames"}},
        ]

    def _group_select_pipeline(self, slice_name):
        """A pipeline that selects only the given slice's documents from the
        pipeline.
        """
        if self.group_field is None:
            return []

        name_field = self.group_field + ".name"
        return [{"$match": {"$expr": {"$eq": ["$" + name_field, slice_name]}}}]

    def _attach_groups_pipeline(self, group_slices=None):
        """A pipeline that attaches the reuested group slice(s) for each
        document and stores them in under ``groups.<slice>`` keys.
        """
        if self.group_field is None:
            return []

        id_field = self.group_field + "._id"
        name_field = self.group_field + ".name"

        F = foe.ViewField
        expr = F(id_field) == "$$group_id"
        if etau.is_container(group_slices):
            expr &= F(name_field).is_in(list(group_slices))
        elif group_slices is not None:
            expr &= F(name_field) == group_slices

        return [
            {
                "$lookup": {
                    "from": self._sample_collection_name,
                    "let": {"group_id": "$" + id_field},
                    "pipeline": [{"$match": {"$expr": expr.to_mongo()}}],
                    "as": "groups",
                }
            },
            {
                "$set": {
                    "groups": {
                        "$arrayToObject": {
                            "$map": {
                                "input": "$groups",
                                "as": "this",
                                "in": ["$$this." + name_field, "$$this"],
                            }
                        }
                    }
                }
            },
        ]

    def _groups_only_pipeline(self, group_slices=None):
        """A pipeline that looks up the requested group slices for each
        document and returns (only) the unwound group slices.
        """
        if self.group_field is None:
            return []

        id_field = self.group_field + "._id"
        name_field = self.group_field + ".name"

        F = foe.ViewField
        expr = F(id_field) == "$$group_id"
        if etau.is_container(group_slices):
            expr &= F(name_field).is_in(list(group_slices))
        elif group_slices is not None:
            expr &= F(name_field) == group_slices

        return [
            {"$project": {self.group_field: True}},
            {
                "$lookup": {
                    "from": self._sample_collection_name,
                    "let": {"group_id": "$" + id_field},
                    "pipeline": [{"$match": {"$expr": expr.to_mongo()}}],
                    "as": "groups",
                }
            },
            {"$unwind": "$groups"},
            {"$replaceRoot": {"newRoot": "$groups"}},
        ]

    def _unwind_groups_pipeline(self):
        """A pipeline that returns (only) the unwound ``groups`` documents."""
        return [
            {
                "$set": {
                    "groups": {
                        "$map": {
                            "input": {"$objectToArray": "$groups"},
                            "as": "this",
                            "in": "$$this.v",
                        }
                    }
                }
            },
            {"$unwind": "$groups"},
            {"$replaceRoot": {"newRoot": "$groups"}},
        ]

    def _aggregate(
        self,
        pipeline=None,
        media_type=None,
        attach_frames=False,
        detach_frames=False,
        frames_only=False,
        support=None,
        group_slice=None,
        group_slices=None,
        detach_groups=False,
        groups_only=False,
        manual_group_select=False,
        post_pipeline=None,
    ):
        _pipeline = self._pipeline(
            pipeline=pipeline,
            media_type=media_type,
            attach_frames=attach_frames,
            detach_frames=detach_frames,
            frames_only=frames_only,
            support=support,
            group_slice=group_slice,
            group_slices=group_slices,
            detach_groups=detach_groups,
            groups_only=groups_only,
            manual_group_select=manual_group_select,
            post_pipeline=post_pipeline,
        )

        return foo.aggregate(self._sample_collection, _pipeline)

    @property
    def _sample_collection_name(self):
        return self._doc.sample_collection_name

    @property
    def _sample_collection(self):
        return foo.get_db_conn()[self._sample_collection_name]

    @property
    def _frame_collection_name(self):
        return self._doc.frame_collection_name

    @property
    def _frame_collection(self):
        return foo.get_db_conn()[self._frame_collection_name]

    @property
    def _frame_indexes(self):
        index_info = self._frame_collection.index_information()
        return [k["key"][0][0] for k in index_info.values()]

    def _apply_field_schema(self, new_fields):
        for field_name, field_str in new_fields.items():
            ftype, embedded_doc_type, subfield = fof.parse_field_str(field_str)
            self.add_sample_field(
                field_name,
                ftype,
                embedded_doc_type=embedded_doc_type,
                subfield=subfield,
            )

    def _apply_frame_field_schema(self, new_fields):
        for field_name, field_str in new_fields.items():
            ftype, embedded_doc_type, subfield = fof.parse_field_str(field_str)
            self.add_frame_field(
                field_name,
                ftype,
                embedded_doc_type=embedded_doc_type,
                subfield=subfield,
            )

    def _ensure_label_field(self, label_field, label_cls):
        if label_field not in self.get_field_schema():
            self.add_sample_field(
                label_field,
                fof.EmbeddedDocumentField,
                embedded_doc_type=label_cls,
            )

    def _expand_schema(self, samples, dynamic):
        expanded = False

        if not dynamic:
            schema = self.get_field_schema(include_private=True)

        for sample in samples:
            for field_name in sample._get_field_names(include_private=True):
                if field_name == "_id":
                    continue

                value = sample[field_name]

                if value is None:
                    continue

                if isinstance(value, fog.Group):
                    self._expand_group_schema(
                        field_name, value.name, sample.media_type
                    )

                if not dynamic and field_name in schema:
                    continue

                if isinstance(value, fog.Group):
                    expanded |= self._add_group_field(
                        field_name, default=value.name
                    )
                else:
                    expanded |= self._sample_doc_cls.add_implied_field(
                        field_name, value, dynamic=dynamic, validate=False
                    )

                if not dynamic:
                    schema = self.get_field_schema(include_private=True)

            if sample.media_type == fom.VIDEO:
                expanded |= self._expand_frame_schema(sample.frames, dynamic)

        if expanded:
            self._reload()

    def _expand_group_schema(self, field_name, slice_name, media_type):
        if self.group_field is not None and field_name != self.group_field:
            raise ValueError("Dataset has no group field '%s'" % field_name)

        if slice_name not in self._doc.group_media_types:
            # If this is the first video slice, we need to initialize the frame
            # field schema
            if media_type == fom.VIDEO and not any(
                slice_media_type == fom.VIDEO
                for slice_media_type in self._doc.group_media_types.values()
            ):
                self._declare_frame_fields()

            self._doc.group_media_types[slice_name] = media_type

            # If dataset doesn't yet have a default group slice, use the first
            # observed value
            if self._doc.default_group_slice is None:
                self._doc.default_group_slice = slice_name
                self._group_slice = slice_name

            self._doc.save()

    def _expand_frame_schema(self, frames, dynamic):
        if not dynamic:
            schema = self.get_frame_field_schema(include_private=True)

        expanded = False
        for frame in frames.values():
            for field_name in frame._get_field_names(include_private=True):
                if field_name == "_id":
                    continue

                if not dynamic and field_name in schema:
                    continue

                value = frame[field_name]

                if value is None:
                    continue

                expanded |= self._frame_doc_cls.add_implied_field(
                    field_name, value, dynamic=dynamic, validate=False
                )

                if not dynamic:
                    schema = self.get_frame_field_schema(include_private=True)

        return expanded

    def _sample_dict_to_doc(self, d):
        try:
            return self._sample_doc_cls.from_dict(d, extended=False)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._sample_doc_cls.from_dict(d, extended=False)

    def _frame_dict_to_doc(self, d):
        try:
            return self._frame_doc_cls.from_dict(d, extended=False)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._frame_doc_cls.from_dict(d, extended=False)

    def _validate_samples(self, samples):
        schema = self.get_field_schema(include_private=True)

        for sample in samples:
            if (
                self.media_type != fom.GROUP
                and sample.media_type != self.media_type
            ):
                raise fom.MediaTypeError(
                    "Sample media type '%s' does not match dataset media type "
                    "'%s'" % (sample.media_type, self.media_type)
                )

            non_existent_fields = None
            found_group = False

            for field_name, value in sample.iter_fields():
                if isinstance(value, fog.Group):
                    if self.media_type != fom.GROUP:
                        raise ValueError(
                            "Only datasets with media type '%s' may contain "
                            "Group fields" % fom.GROUP
                        )

                    if field_name != self.group_field:
                        raise ValueError(
                            "Dataset has no group field '%s'" % field_name
                        )

                    slice_media_type = self._doc.group_media_types.get(
                        value.name,
                        None,
                    )
                    if slice_media_type is None:
                        raise ValueError(
                            "Dataset has no group slice '%s'" % value.name
                        )
                    elif sample.media_type != slice_media_type:
                        raise ValueError(
                            "Sample media type '%s' does not match group "
                            "slice '%s' media type '%s'"
                            % (
                                sample.media_type,
                                value.name,
                                slice_media_type,
                            )
                        )

                    found_group = True

                field = schema.get(field_name, None)
                if field is None:
                    if value is not None:
                        if non_existent_fields is None:
                            non_existent_fields = {field_name}
                        else:
                            non_existent_fields.add(field_name)
                else:
                    if value is not None or not field.null:
                        try:
                            field.validate(value)
                        except Exception as e:
                            raise ValueError(
                                "Invalid value for field '%s'. Reason: %s"
                                % (field_name, str(e))
                            )

            if non_existent_fields:
                raise ValueError(
                    "Fields %s do not exist on dataset '%s'"
                    % (non_existent_fields, self.name)
                )

            if self.media_type == fom.GROUP and not found_group:
                raise ValueError(
                    "Found sample missing group field '%s'" % self.group_field
                )

    def reload(self):
        """Reloads the dataset and any in-memory samples from the database."""
        self._reload(hard=True)
        self._reload_docs(hard=True)

    def clear_cache(self):
        """Clears the dataset's in-memory cache."""
        self._annotation_cache.clear()
        self._brain_cache.clear()
        self._evaluation_cache.clear()

    def _reload(self, hard=False):
        if not hard:
            self._doc.reload()
            return

        doc, sample_doc_cls, frame_doc_cls = _load_dataset(
            self, self.name, virtual=True
        )

        self._doc = doc
        self._sample_doc_cls = sample_doc_cls
        self._frame_doc_cls = frame_doc_cls

        if self._group_slice is None:
            self._group_slice = doc.default_group_slice

        self._deleted = False

        self._update_last_loaded_at()

    def _reload_docs(self, hard=False):
        fos.Sample._reload_docs(self._sample_collection_name, hard=hard)

        if self._has_frame_fields():
            fofr.Frame._reload_docs(self._frame_collection_name, hard=hard)

    def _serialize(self):
        return self._doc.to_dict(extended=True)

    def _update_last_loaded_at(self):
        self._doc.last_loaded_at = datetime.utcnow()
        self._doc.save()


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


def _list_datasets(include_private=False):
    conn = foo.get_db_conn()

    if include_private:
        query = {}
    else:
        # Datasets whose sample collections don't start with `samples.` are
        # private e.g., patches or frames datasets
        query = {"sample_collection_name": {"$regex": "^samples\\."}}

    # We don't want an error here if `name == None`
    _sort = lambda l: sorted(l, key=lambda x: (x is None, x))

    return _sort(conn.datasets.find(query).distinct("name"))


def _list_dataset_info():
    info = []
    for name in _list_datasets():
        try:
            dataset = Dataset(name, _create=False, _virtual=True)
            num_samples = dataset._sample_collection.estimated_document_count()
            i = {
                "name": dataset.name,
                "created_at": dataset.created_at,
                "last_loaded_at": dataset.last_loaded_at,
                "version": dataset.version,
                "persistent": dataset.persistent,
                "media_type": dataset.media_type,
                "tags": dataset.tags,
                "num_samples": num_samples,
            }
        except:
            # If the dataset can't be loaded, it likely requires migration, so
            # we can't show any information about it
            i = {
                "name": name,
                "created_at": None,
                "last_loaded_at": None,
                "version": None,
                "persistent": None,
                "media_type": None,
                "tags": None,
                "num_samples": None,
            }

        info.append(i)

    return info


def _create_dataset(
    obj,
    name,
    persistent=False,
    _patches=False,
    _frames=False,
    _clips=False,
    _src_collection=None,
):
    slug = _validate_dataset_name(name)

    _id = ObjectId()

    sample_collection_name = _make_sample_collection_name(
        _id, patches=_patches, frames=_frames, clips=_clips
    )
    sample_doc_cls = _create_sample_document_cls(obj, sample_collection_name)

    # pylint: disable=no-member
    sample_fields = [
        foo.SampleFieldDocument.from_field(field)
        for field in sample_doc_cls._fields.values()
    ]

    if _clips:
        # Clips datasets directly inherit frames from source dataset
        src_dataset = _src_collection._dataset
        frame_collection_name = src_dataset._doc.frame_collection_name
        frame_doc_cls = src_dataset._frame_doc_cls
        frame_fields = src_dataset._doc.frame_fields
    else:
        # @todo don't create frame collection until media type is VIDEO?
        frame_collection_name = _make_frame_collection_name(
            sample_collection_name
        )
        frame_doc_cls = _create_frame_document_cls(obj, frame_collection_name)
        frame_fields = []

    dataset_doc = foo.DatasetDocument(
        id=_id,
        name=name,
        slug=slug,
        version=focn.VERSION,
        created_at=datetime.utcnow(),
        media_type=None,  # will be inferred when first sample is added
        sample_collection_name=sample_collection_name,
        frame_collection_name=frame_collection_name,
        persistent=persistent,
        sample_fields=sample_fields,
        frame_fields=frame_fields,
        app_config=DatasetAppConfig(),
    )
    dataset_doc.save()

    if _clips:
        _create_indexes(sample_collection_name, None)
    else:
        _create_indexes(sample_collection_name, frame_collection_name)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _create_indexes(sample_collection_name, frame_collection_name):
    conn = foo.get_db_conn()

    collection = conn[sample_collection_name]
    collection.create_index("filepath")

    if frame_collection_name is not None:
        frame_collection = conn[frame_collection_name]
        frame_collection.create_index(
            [("_sample_id", 1), ("frame_number", 1)], unique=True
        )


def _make_sample_collection_name(
    dataset_id, patches=False, frames=False, clips=False
):
    if patches and frames:
        prefix = "patches.frames"
    elif patches:
        prefix = "patches"
    elif frames:
        prefix = "frames"
    elif clips:
        prefix = "clips"
    else:
        prefix = "samples"

    return prefix + "." + str(dataset_id)


def _make_frame_collection_name(sample_collection_name):
    return "frames." + sample_collection_name


def _create_sample_document_cls(
    dataset, sample_collection_name, field_docs=None
):
    cls = type(sample_collection_name, (foo.DatasetSampleDocument,), {})
    cls._dataset = dataset

    _declare_fields(dataset, cls, field_docs=field_docs)
    return cls


def _create_frame_document_cls(
    dataset, frame_collection_name, field_docs=None
):
    cls = type(frame_collection_name, (foo.DatasetFrameDocument,), {})
    cls._dataset = dataset

    _declare_fields(dataset, cls, field_docs=field_docs)
    return cls


def _declare_fields(dataset, doc_cls, field_docs=None):
    for field_name in tuple(doc_cls._fields.keys()):
        field = doc_cls._fields[field_name]

        if isinstance(field, fof.EmbeddedDocumentField):
            field = foo.create_field(field_name, **foo.get_field_kwargs(field))
            doc_cls._declare_field(dataset, field_name, field)
        else:
            field._set_dataset(dataset, field_name)

    if field_docs is not None:
        for field_doc in field_docs:
            doc_cls._declare_field(dataset, field_doc.name, field_doc)


def _load_clips_source_dataset(frame_collection_name):
    # All clips datasets have a source dataset with the same frame collection
    query = {
        "frame_collection_name": frame_collection_name,
        "sample_collection_name": {"$regex": "^samples\\."},
    }

    conn = foo.get_db_conn()
    doc = conn.datasets.find_one(query, {"name": 1})

    if doc is None:
        # The source dataset must have been deleted...
        return None

    return load_dataset(doc["name"])


def _load_dataset(obj, name, virtual=False):
    if not virtual:
        fomi.migrate_dataset_if_necessary(name)

    try:
        return _do_load_dataset(obj, name)
    except Exception as e:
        try:
            version = fomi.get_dataset_revision(name)
        except:
            raise e

        if version != focn.VERSION:
            raise ValueError(
                "Failed to load dataset '%s' from v%s using client v%s. "
                "You may need to upgrade your client"
                % (name, version, focn.VERSION)
            ) from e

        raise e


def _do_load_dataset(obj, name):
    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise ValueError("Dataset '%s' not found" % name)

    sample_collection_name = dataset_doc.sample_collection_name
    frame_collection_name = dataset_doc.frame_collection_name

    sample_doc_cls = _create_sample_document_cls(
        obj, sample_collection_name, field_docs=dataset_doc.sample_fields
    )

    if sample_collection_name.startswith("clips."):
        # Clips datasets directly inherit frames from source dataset
        _src_dataset = _load_clips_source_dataset(frame_collection_name)
    else:
        _src_dataset = None

    if _src_dataset is not None:
        frame_doc_cls = _src_dataset._frame_doc_cls
    else:
        frame_doc_cls = _create_frame_document_cls(
            obj, frame_collection_name, field_docs=dataset_doc.frame_fields
        )

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _delete_dataset_doc(dataset_doc):
    for view_doc in dataset_doc.saved_views:
        view_doc.delete()

    for run_doc in dataset_doc.annotation_runs.values():
        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    for run_doc in dataset_doc.brain_methods.values():
        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    for run_doc in dataset_doc.evaluations.values():
        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    dataset_doc.delete()


def _clone_dataset_or_view(dataset_or_view, name, persistent):
    slug = _validate_dataset_name(name)

    contains_videos = dataset_or_view._contains_videos(any_slice=True)

    if isinstance(dataset_or_view, fov.DatasetView):
        dataset = dataset_or_view._dataset
        view = dataset_or_view
    else:
        dataset = dataset_or_view
        view = None

    dataset._reload()

    _id = ObjectId()

    sample_collection_name = _make_sample_collection_name(_id)
    frame_collection_name = _make_frame_collection_name(sample_collection_name)

    #
    # Clone dataset document
    #

    dataset_doc = dataset._doc.copy()

    dataset_doc.id = _id
    dataset_doc.name = name
    dataset_doc.slug = slug
    dataset_doc.created_at = datetime.utcnow()
    dataset_doc.last_loaded_at = None
    dataset_doc.persistent = persistent
    dataset_doc.sample_collection_name = sample_collection_name
    dataset_doc.frame_collection_name = frame_collection_name

    dataset_doc.media_type = dataset_or_view.media_type
    if dataset_doc.media_type != fom.GROUP:
        dataset_doc.group_field = None
        dataset_doc.group_media_types = {}
        dataset_doc.default_group_slice = None

    # Runs/views get special treatment at the end
    dataset_doc.saved_views.clear()
    dataset_doc.annotation_runs.clear()
    dataset_doc.brain_methods.clear()
    dataset_doc.evaluations.clear()

    if view is not None:
        # Respect filtered sample fields, if any
        schema = view.get_field_schema()
        dataset_doc.sample_fields = [
            f
            for f in dataset_doc.sample_fields
            if f.name in set(schema.keys())
        ]

        # Respect filtered frame fields, if any
        if contains_videos:
            frame_schema = view.get_frame_field_schema()
            dataset_doc.frame_fields = [
                f
                for f in dataset_doc.frame_fields
                if f.name in set(frame_schema.keys())
            ]

    dataset_doc.save()

    # Create indexes
    _create_indexes(sample_collection_name, frame_collection_name)

    # Clone samples
    coll, pipeline = _get_samples_pipeline(dataset_or_view)
    pipeline.append({"$out": sample_collection_name})
    foo.aggregate(coll, pipeline)

    # Clone frames
    if contains_videos:
        coll, pipeline = _get_frames_pipeline(dataset_or_view)
        pipeline.append({"$out": frame_collection_name})
        foo.aggregate(coll, pipeline)

    clone_dataset = load_dataset(name)

    # Clone extras (full datasets only)
    if view is None and (
        dataset.has_saved_views
        or dataset.has_annotation_runs
        or dataset.has_brain_runs
        or dataset.has_evaluations
    ):
        _clone_extras(clone_dataset, dataset._doc)

    return clone_dataset


def _get_samples_pipeline(sample_collection):
    if sample_collection.media_type == fom.GROUP:
        sample_collection = sample_collection.select_group_slices(
            _allow_mixed=True
        )

    coll = sample_collection._dataset._sample_collection
    pipeline = sample_collection._pipeline(
        detach_frames=True, detach_groups=True
    )
    return coll, pipeline


def _get_frames_pipeline(sample_collection):
    if isinstance(sample_collection, fov.DatasetView):
        dataset = sample_collection._dataset
        view = sample_collection
    else:
        dataset = sample_collection
        view = None

    if dataset._is_clips:
        # Clips datasets use `sample_id` to associated with frames, but now as
        # a standalone collection, they must use `_id`
        coll = dataset._sample_collection
        pipeline = sample_collection._pipeline(attach_frames=True) + [
            {"$project": {"frames": True}},
            {"$unwind": "$frames"},
            {"$set": {"frames._sample_id": "$_id"}},
            {"$replaceRoot": {"newRoot": "$frames"}},
            {"$unset": "_id"},
        ]
    elif view is not None:
        # The view may modify the frames, so we route the frames though
        # the sample collection

        if view.media_type == fom.GROUP:
            view = view.select_group_slices(media_type=fom.VIDEO)

        coll = dataset._sample_collection
        pipeline = view._pipeline(frames_only=True)
    else:
        # Here we can directly aggregate on the frame collection
        coll = dataset._frame_collection
        pipeline = []

    return coll, pipeline


def _save_view(view, fields=None):
    # Note: for grouped views, only the active slice's contents are saved,
    # since views cannot edit other slices

    dataset = view._dataset

    contains_videos = view._contains_videos()
    all_fields = fields is None

    if fields is None:
        fields = []

    if etau.is_str(fields):
        fields = [fields]

    if contains_videos:
        sample_fields, frame_fields = fou.split_frame_fields(fields)
    else:
        sample_fields = fields
        frame_fields = []

    if sample_fields:
        sample_fields = dataset._handle_db_fields(sample_fields)

    if frame_fields:
        frame_fields = dataset._handle_db_fields(frame_fields, frames=True)

    save_samples = sample_fields or all_fields
    save_frames = contains_videos and (frame_fields or all_fields)

    # Must retrieve IDs now in case view changes after saving
    sample_ids = view.values("id")

    #
    # Save samples
    #

    pipeline = view._pipeline(detach_frames=True, detach_groups=True)

    if sample_fields:
        pipeline.append({"$project": {f: True for f in sample_fields}})
        pipeline.append({"$merge": dataset._sample_collection_name})
        foo.aggregate(dataset._sample_collection, pipeline)
    elif save_samples:
        pipeline.append(
            {
                "$merge": {
                    "into": dataset._sample_collection_name,
                    "whenMatched": "replace",
                }
            }
        )
        foo.aggregate(dataset._sample_collection, pipeline)

    #
    # Save frames
    #

    if save_frames:
        # The view may modify the frames, so we route the frames through the
        # sample collection
        pipeline = view._pipeline(frames_only=True)

        # Clips datasets may contain overlapping clips, so we must select only
        # the first occurrance of each frame
        if dataset._is_clips:
            pipeline.extend(
                [
                    {"$group": {"_id": "$_id", "doc": {"$first": "$$ROOT"}}},
                    {"$replaceRoot": {"newRoot": "$doc"}},
                ]
            )

        if frame_fields:
            pipeline.append({"$project": {f: True for f in frame_fields}})
            pipeline.append({"$merge": dataset._frame_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)
        else:
            pipeline.append(
                {
                    "$merge": {
                        "into": dataset._frame_collection_name,
                        "whenMatched": "replace",
                    }
                }
            )
            foo.aggregate(dataset._sample_collection, pipeline)

    #
    # Reload in-memory documents
    #

    if save_samples:
        fos.Sample._reload_docs(
            dataset._sample_collection_name, sample_ids=sample_ids
        )

    if save_frames:
        fofr.Frame._reload_docs(
            dataset._frame_collection_name, sample_ids=sample_ids
        )


def _merge_dataset_doc(
    dataset,
    collection_or_doc,
    fields=None,
    omit_fields=None,
    expand_schema=True,
    merge_info=True,
    overwrite_info=False,
):
    #
    # Merge schemas
    #

    src_media_type = collection_or_doc.media_type

    if dataset.media_type is None:
        if src_media_type == fom.MIXED:
            dataset.media_type = fom.GROUP
        elif src_media_type is not None:
            dataset.media_type = src_media_type

    curr_doc = dataset._doc
    has_frame_fields = dataset._has_frame_fields()

    if isinstance(collection_or_doc, foc.SampleCollection):
        # Respects filtered schemas, if any
        doc = collection_or_doc._root_dataset._doc
        schema = collection_or_doc.get_field_schema()
        if has_frame_fields:
            frame_schema = collection_or_doc.get_frame_field_schema()
    else:
        doc = collection_or_doc
        schema = {f.name: f.to_field() for f in doc.sample_fields}
        if has_frame_fields:
            frame_schema = {f.name: f.to_field() for f in doc.frame_fields}

    if curr_doc.media_type == fom.GROUP:
        # Get the group field this way because a view might omit the field
        src_group_field = _get_group_field(schema)

        if src_group_field is None:
            raise ValueError(
                "Cannot merge samples with no group field into a grouped "
                "dataset"
            )

        if curr_doc.group_field is None:
            curr_doc.group_field = doc.group_field
        elif src_group_field != curr_doc.group_field:
            raise ValueError(
                "Cannot merge samples with group field '%s' into a "
                "dataset with group field '%s'"
                % (src_group_field, curr_doc.group_field)
            )

        if src_media_type == fom.GROUP:
            src_group_media_types = doc.group_media_types
            src_default_group_slice = doc.default_group_slice
        else:
            src_group_media_types = collection_or_doc._get_group_media_types()
            src_default_group_slice = next(
                iter(src_group_media_types.keys()), None
            )

        for name, media_type in src_group_media_types.items():
            if name not in curr_doc.group_media_types:
                curr_doc.group_media_types[name] = media_type
            else:
                curr_media_type = curr_doc.group_media_types[name]
                if curr_media_type != media_type:
                    raise ValueError(
                        "Cannot merge a collection whose '%s' slice has media "
                        "type '%s' into a dataset whose '%s' slice has media "
                        "type '%s'" % (name, media_type, name, curr_media_type)
                    )

        if curr_doc.default_group_slice is None:
            curr_doc.default_group_slice = src_default_group_slice

        if dataset._group_slice is None:
            dataset._group_slice = src_default_group_slice
    elif src_media_type not in (None, dataset.media_type):
        raise ValueError(
            "Cannot merge a collection with media_type='%s' into a dataset "
            "with media_type='%s'" % (src_media_type, dataset.media_type)
        )

    # Omit fields first in case `fields` is a dict that changes field names
    if omit_fields is not None:
        if has_frame_fields:
            omit_fields, omit_frame_fields = fou.split_frame_fields(
                omit_fields
            )
            frame_schema = {
                k: v
                for k, v in frame_schema.items()
                if k not in omit_frame_fields
            }

        schema = {k: v for k, v in schema.items() if k not in omit_fields}

    if fields is not None:
        if not isinstance(fields, dict):
            fields = {f: f for f in fields}

        if has_frame_fields:
            fields, frame_fields = fou.split_frame_fields(fields)

            frame_schema = {
                frame_fields[k]: v
                for k, v in frame_schema.items()
                if k in frame_fields
            }

        schema = {fields[k]: v for k, v in schema.items() if k in fields}

    dataset._sample_doc_cls.merge_field_schema(
        schema, expand_schema=expand_schema
    )

    if has_frame_fields and frame_schema is not None:
        dataset._frame_doc_cls.merge_field_schema(
            frame_schema, expand_schema=expand_schema
        )

    if not merge_info:
        curr_doc.reload()
        return

    #
    # Merge info
    #

    if overwrite_info:
        curr_doc.info.update(doc.info)
        curr_doc.classes.update(doc.classes)
        curr_doc.mask_targets.update(doc.mask_targets)
        curr_doc.skeletons.update(doc.skeletons)

        if doc.default_classes:
            curr_doc.default_classes = doc.default_classes

        if doc.default_mask_targets:
            curr_doc.default_mask_targets = doc.default_mask_targets

        if doc.default_skeleton:
            curr_doc.default_skeleton = doc.default_skeleton
    else:
        _update_no_overwrite(curr_doc.info, doc.info)
        _update_no_overwrite(curr_doc.classes, doc.classes)
        _update_no_overwrite(curr_doc.mask_targets, doc.mask_targets)
        _update_no_overwrite(curr_doc.skeletons, doc.skeletons)

        if doc.default_classes and not curr_doc.default_classes:
            curr_doc.default_classes = doc.default_classes

        if doc.default_mask_targets and not curr_doc.default_mask_targets:
            curr_doc.default_mask_targets = doc.default_mask_targets

        if doc.default_skeleton and not curr_doc.default_skeleton:
            curr_doc.default_skeleton = doc.default_skeleton

    curr_doc.save()


def _update_no_overwrite(d, dnew):
    d.update({k: v for k, v in dnew.items() if k not in d})


def _clone_extras(dst_dataset, src_doc):
    dst_doc = dst_dataset._doc

    # Clone saved views
    for _view_doc in src_doc.saved_views:
        view_doc = _clone_view_doc(_view_doc)
        view_doc.dataset_id = dst_doc.id
        view_doc.save()

        dst_doc.saved_views.append(view_doc)

    # Clone annotation runs
    for anno_key, _run_doc in src_doc.annotation_runs.items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.save()

        dst_doc.annotation_runs[anno_key] = run_doc

    # Clone brain method runs
    for brain_key, _run_doc in src_doc.brain_methods.items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.save()

        dst_doc.brain_methods[brain_key] = run_doc

    # Clone evaluation runs
    for eval_key, _run_doc in src_doc.evaluations.items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.save()

        dst_doc.evaluations[eval_key] = run_doc

    dst_doc.save()


def _clone_view_doc(view_doc):
    _view_doc = view_doc.copy()
    _view_doc.id = ObjectId()
    return _view_doc


def _clone_run(run_doc):
    _run_doc = run_doc.copy()
    _run_doc.id = ObjectId()

    # Unfortunately the only way to copy GridFS files is to read-write them...
    # https://jira.mongodb.org/browse/TOOLS-2208
    run_doc.results.seek(0)
    results_bytes = run_doc.results.read()
    _run_doc.results = None
    _run_doc.results.put(results_bytes, content_type="application/json")

    return _run_doc


def _ensure_index(dataset, db_field, unique=False):
    # For some reason the ID index is not reported by `index_information()` as
    # being unique like other manually created indexes, but it is
    if db_field == "_id":
        return False, False

    coll = dataset._sample_collection

    # db_field -> (name, unique)
    index_map = _get_single_index_map(coll)

    new = False
    dropped = False

    if db_field in index_map:
        name, _unique = index_map[db_field]
        if _unique or (_unique == unique):
            # Satisfactory index already exists
            return new, dropped

        # Must upgrade to unique index
        coll.drop_index(name)
        dropped = True

    coll.create_index(db_field, unique=True)
    new = True

    return new, dropped


def _cleanup_index(dataset, db_field, new_index, dropped_index):
    coll = dataset._sample_collection

    if new_index:
        # db_field -> (name, unique)
        index_map = _get_single_index_map(coll)

        name = index_map[db_field][0]
        coll.drop_index(name)

    if dropped_index:
        coll.create_index(db_field)


def _cleanup_frame_index(dataset, index):
    coll = dataset._frame_collection

    if index:
        coll.drop_index(index)


def _get_single_index_map(coll):
    # db_field -> (name, unique)
    return {
        v["key"][0][0]: (k, v.get("unique", False))
        for k, v in coll.index_information().items()
        if len(v["key"]) == 1
    }


def _add_collection_with_new_ids(
    dataset,
    sample_collection,
    include_info=True,
    overwrite_info=False,
):
    dataset._merge_doc(
        sample_collection,
        merge_info=include_info,
        overwrite_info=overwrite_info,
    )

    contains_groups = sample_collection.media_type == fom.GROUP
    contains_videos = sample_collection._contains_videos(any_slice=True)

    if contains_groups:
        src_samples = sample_collection.select_group_slices(_allow_mixed=True)
    else:
        src_samples = sample_collection

    if not contains_videos:
        src_samples._aggregate(
            detach_groups=True,
            post_pipeline=[
                {"$unset": "_id"},
                {
                    "$merge": {
                        "into": dataset._sample_collection_name,
                        "whenMatched": "keepExisting",
                        "whenNotMatched": "insert",
                    }
                },
            ],
        )

        return

    #
    # For video datasets, we must take greater care, because sample IDs are
    # used as foreign keys in the frame documents
    #

    if contains_groups:
        src_videos = sample_collection.select_group_slices(
            media_type=fom.VIDEO
        )
    else:
        src_videos = sample_collection

    old_ids = src_samples.values("_id")

    src_samples._aggregate(
        detach_frames=True,
        detach_groups=True,
        post_pipeline=[
            {"$unset": "_id"},
            {
                "$merge": {
                    "into": dataset._sample_collection_name,
                    "whenMatched": "keepExisting",
                    "whenNotMatched": "insert",
                }
            },
        ],
    )

    src_videos._aggregate(
        frames_only=True,
        post_pipeline=[
            {"$set": {"_tmp": "$_sample_id", "_sample_id": {"$rand": {}}}},
            {"$unset": "_id"},
            {
                "$merge": {
                    "into": dataset._frame_collection_name,
                    "whenMatched": "keepExisting",
                    "whenNotMatched": "insert",
                }
            },
        ],
    )

    new_ids = dataset[-len(old_ids) :].values("_id")

    ops = [
        UpdateMany(
            {"_tmp": _old},
            {"$set": {"_sample_id": _new}, "$unset": {"_tmp": ""}},
        )
        for _old, _new in zip(old_ids, new_ids)
    ]
    dataset._bulk_write(ops, frames=True)

    return [str(_id) for _id in new_ids]


def _merge_samples_python(
    dataset,
    samples,
    key_field="filepath",
    key_fcn=None,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
    expand_schema=True,
    dynamic=False,
    num_samples=None,
):
    if (
        isinstance(samples, foc.SampleCollection)
        and samples.media_type == fom.GROUP
    ):
        samples = samples.select_group_slices(_allow_mixed=True)
        dst = dataset.select_group_slices(_allow_mixed=True)
    else:
        dst = dataset

    if num_samples is None:
        try:
            num_samples = len(samples)
        except:
            pass

    if key_fcn is None:
        id_map = {k: v for k, v in zip(*dst.values([key_field, "_id"]))}
        key_fcn = lambda sample: sample[key_field]
    else:
        id_map = {}
        logger.info("Indexing dataset...")
        for sample in dst.iter_samples(progress=True):
            id_map[key_fcn(sample)] = sample._id

    _samples = _make_merge_samples_generator(
        dataset,
        samples,
        key_fcn,
        id_map,
        skip_existing=skip_existing,
        insert_new=insert_new,
        fields=fields,
        omit_fields=omit_fields,
        merge_lists=merge_lists,
        overwrite=overwrite,
        expand_schema=expand_schema,
    )

    logger.info("Merging samples...")
    dataset._upsert_samples(
        _samples,
        expand_schema=expand_schema,
        dynamic=dynamic,
        num_samples=num_samples,
    )


def _make_merge_samples_generator(
    dataset,
    samples,
    key_fcn,
    id_map,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
    expand_schema=True,
):
    # When inserting new samples, `filepath` cannot be excluded
    if insert_new:
        if isinstance(fields, dict):
            insert_fields = fields.copy()
            insert_fields["filepath"] = "filepath"
        elif fields is not None:
            insert_fields = fields.copy()
            if "filepath" not in insert_fields:
                insert_fields = ["filepath"] + insert_fields
        else:
            insert_fields = None

        insert_omit_fields = omit_fields
        if insert_omit_fields is not None:
            insert_omit_fields = [
                f for f in insert_omit_fields if f != "filepath"
            ]

    for sample in samples:
        key = key_fcn(sample)
        if key in id_map:
            if not skip_existing:
                existing_sample = dataset[id_map[key]]
                existing_sample.merge(
                    sample,
                    fields=fields,
                    omit_fields=omit_fields,
                    merge_lists=merge_lists,
                    overwrite=overwrite,
                    expand_schema=expand_schema,
                )

                yield existing_sample
        elif insert_new:
            if insert_fields is not None or insert_omit_fields is not None:
                sample = sample.copy(
                    fields=insert_fields, omit_fields=insert_omit_fields
                )
            elif sample._in_db:
                sample = sample.copy()

            yield sample


def _merge_samples_pipeline(
    src_collection,
    dst_dataset,
    key_field,
    skip_existing=False,
    insert_new=True,
    fields=None,
    omit_fields=None,
    merge_lists=True,
    overwrite=True,
):
    in_key_field = key_field
    db_fields_map = src_collection._get_db_fields_map()
    key_field = db_fields_map.get(key_field, key_field)

    contains_groups = src_collection.media_type == fom.GROUP
    if contains_groups:
        src_samples = src_collection.select_group_slices(_allow_mixed=True)
    else:
        src_samples = src_collection

    contains_videos = src_collection._contains_videos(any_slice=True)
    if contains_videos:
        if contains_groups:
            src_videos = src_collection.select_group_slices(
                media_type=fom.VIDEO
            )
        else:
            src_videos = src_collection

        if dst_dataset.media_type == fom.GROUP:
            dst_videos = dst_dataset.select_group_slices(media_type=fom.VIDEO)
        else:
            dst_videos = dst_dataset

    src_dataset = src_collection._dataset

    if contains_videos:
        frame_fields = None
        omit_frame_fields = None

    if fields is not None:
        if not isinstance(fields, dict):
            fields = {f: f for f in fields}

        if contains_videos:
            fields, frame_fields = fou.split_frame_fields(fields)

    if omit_fields is not None:
        if contains_videos:
            omit_fields, omit_frame_fields = fou.split_frame_fields(
                omit_fields
            )

        if fields is not None:
            fields = {k: v for k, v in fields.items() if k not in omit_fields}
            omit_fields = None

        if contains_videos and frame_fields is not None:
            frame_fields = {
                k: v
                for k, v in frame_fields.items()
                if k not in omit_frame_fields
            }
            omit_frame_fields = None

    #
    # Prepare samples merge pipeline
    #

    default_fields = set(
        src_collection._get_default_sample_fields(include_private=True)
    )
    default_fields.discard("id")

    sample_pipeline = []

    if fields is not None:
        project = {key_field: True}

        for k, v in fields.items():
            k = db_fields_map.get(k, k)
            v = db_fields_map.get(v, v)
            if k == v:
                project[k] = True
            else:
                project[v] = "$" + k

        if insert_new:
            # Must include default fields when new samples may be inserted.
            # Any extra fields here are omitted in `when_matched` pipeline
            project["filepath"] = True
            project["_rand"] = True
            project["_media_type"] = True

            if "tags" not in project:
                project["tags"] = []

        sample_pipeline.append({"$project": project})

    if omit_fields is not None:
        _omit_fields = set(omit_fields)
    else:
        _omit_fields = set()

    _omit_fields.add("id")
    _omit_fields.discard(in_key_field)

    if insert_new:
        # Can't omit default fields here when new samples may be inserted.
        # Any extra fields here are omitted in `when_matched` pipeline
        _omit_fields -= default_fields

    if _omit_fields:
        unset_fields = [db_fields_map.get(f, f) for f in _omit_fields]
        sample_pipeline.append({"$unset": unset_fields})

    if skip_existing:
        when_matched = "keepExisting"
    else:
        # We had to include all default fields since they are required if new
        # samples are inserted, but, when merging, the user may have wanted
        # them excluded
        delete_fields = set()
        if insert_new:
            if fields is not None:
                delete_fields.update(
                    f for f in default_fields if f not in set(fields.values())
                )

            if omit_fields is not None:
                delete_fields.update(
                    f for f in default_fields if f in omit_fields
                )

        when_matched = _merge_docs(
            src_collection,
            merge_lists=merge_lists,
            fields=fields,
            omit_fields=omit_fields,
            delete_fields=delete_fields,
            overwrite=overwrite,
            frames=False,
        )

    if insert_new:
        when_not_matched = "insert"
    else:
        when_not_matched = "discard"

    sample_pipeline.append(
        {
            "$merge": {
                "into": dst_dataset._sample_collection_name,
                "on": key_field,
                "whenMatched": when_matched,
                "whenNotMatched": when_not_matched,
            }
        }
    )

    #
    # Prepare frames merge pipeline
    #
    # The implementation of merging video frames is currently a bit complex.
    # It may be possible to simplify this...
    #
    # The trouble is that the `_sample_id` of the frame documents need to match
    # the `_id` of the sample documents after merging. There may be a more
    # clever way to make this happen via `$lookup` than what is implemented
    # here, but here's the current workflow:
    #
    # - Store the `key_field` value on each frame document in both the source
    #   and destination collections corresopnding to its parent sample in a
    #   temporary `frame_key_field` field
    # - Merge the sample documents without frames attached
    # - Merge the frame documents on `[frame_key_field, frame_number]` with
    #   their old `_sample_id`s unset
    # - Generate a `key_field` -> `_id` mapping for the post-merge sample docs,
    #   then make a pass over the frame documents and set
    #   their `_sample_id` to the corresponding value from this mapping
    # - The merge is complete, so delete `frame_key_field` from both frame
    #   collections
    #

    if contains_videos:
        frame_key_field = "_merge_key"

        # @todo this there a cleaner way to avoid this? we have to be sure that
        # `frame_key_field` is not excluded by a user's view here...
        _src_videos = _always_select_field(
            src_videos, "frames." + frame_key_field
        )

        db_fields_map = src_collection._get_db_fields_map(frames=True)

        frame_pipeline = []

        if frame_fields is not None:
            project = {}
            for k, v in frame_fields.items():
                k = db_fields_map.get(k, k)
                v = db_fields_map.get(v, v)
                if k == v:
                    project[k] = True
                else:
                    project[v] = "$" + k

            project[frame_key_field] = True
            project["frame_number"] = True
            frame_pipeline.append({"$project": project})

        if omit_frame_fields is not None:
            _omit_frame_fields = set(omit_frame_fields)
        else:
            _omit_frame_fields = set()

        _omit_frame_fields.update(["id", "_sample_id"])
        _omit_frame_fields.discard(frame_key_field)
        _omit_frame_fields.discard("frame_number")

        unset_fields = [db_fields_map.get(f, f) for f in _omit_frame_fields]
        frame_pipeline.append({"$unset": unset_fields})

        if skip_existing:
            when_frame_matched = "keepExisting"
        else:
            when_frame_matched = _merge_docs(
                src_collection,
                merge_lists=merge_lists,
                fields=frame_fields,
                omit_fields=omit_frame_fields,
                overwrite=overwrite,
                frames=True,
            )

        frame_pipeline.append(
            {
                "$merge": {
                    "into": dst_dataset._frame_collection_name,
                    "on": [frame_key_field, "frame_number"],
                    "whenMatched": when_frame_matched,
                    "whenNotMatched": "insert",
                }
            }
        )

    #
    # Perform the merge(s)
    #
    # We wrap this in a try-finally because we need to ensure that temporary
    # data and collection indexes are deleted if something goes wrong during
    # the actual merges
    #

    new_src_index = None
    dropped_src_index = None
    new_dst_index = None
    dropped_dst_index = None
    dst_frame_index = None
    src_frame_index = None

    try:
        # Create unique index on merge key, if necessary
        new_src_index, dropped_src_index = _ensure_index(
            src_dataset, key_field, unique=True
        )
        new_dst_index, dropped_dst_index = _ensure_index(
            dst_dataset, key_field, unique=True
        )

        if contains_videos:
            _index_frames(dst_videos, key_field, frame_key_field)
            _index_frames(src_videos, key_field, frame_key_field)

            # Create unique index on frame merge key
            frame_index_spec = [(frame_key_field, 1), ("frame_number", 1)]
            dst_frame_index = dst_dataset._frame_collection.create_index(
                frame_index_spec, unique=True
            )
            src_frame_index = src_dataset._frame_collection.create_index(
                frame_index_spec, unique=True
            )

        # Merge samples
        src_samples._aggregate(
            detach_frames=True,
            detach_groups=True,
            post_pipeline=sample_pipeline,
        )

        if contains_videos:
            # Merge frames
            _src_videos._aggregate(
                frames_only=True, post_pipeline=frame_pipeline
            )

            # Finalize IDs
            _finalize_frames(dst_videos, key_field, frame_key_field)
    finally:
        # Cleanup indexes
        _cleanup_index(
            src_dataset, key_field, new_src_index, dropped_src_index
        )
        _cleanup_index(
            dst_dataset, key_field, new_dst_index, dropped_dst_index
        )

        if contains_videos:
            # Cleanup indexes
            _cleanup_frame_index(dst_dataset, dst_frame_index)
            _cleanup_frame_index(src_dataset, src_frame_index)

            # Cleanup merge key
            cleanup_op = {"$unset": {frame_key_field: ""}}
            src_dataset._frame_collection.update_many({}, cleanup_op)
            dst_dataset._frame_collection.update_many({}, cleanup_op)

    # Reload docs
    fos.Sample._reload_docs(dst_dataset._sample_collection_name)
    if contains_videos:
        fofr.Frame._reload_docs(dst_dataset._frame_collection_name)


def _merge_docs(
    sample_collection,
    merge_lists=True,
    fields=None,
    omit_fields=None,
    delete_fields=None,
    overwrite=False,
    frames=False,
):
    if frames:
        schema = sample_collection.get_frame_field_schema()
    else:
        schema = sample_collection.get_field_schema()

    if merge_lists:
        list_fields = []
        elem_fields = []
        for field, field_type in schema.items():
            if fields is not None and field not in fields:
                continue

            if omit_fields is not None and field in omit_fields:
                continue

            if isinstance(field_type, fof.ListField):
                root = fields[field] if fields is not None else field
                list_fields.append(root)
            elif isinstance(
                field_type, fof.EmbeddedDocumentField
            ) and issubclass(field_type.document_type, fol._LABEL_LIST_FIELDS):
                root = fields[field] if fields is not None else field
                elem_fields.append(
                    root + "." + field_type.document_type._LABEL_LIST_FIELD
                )
    else:
        list_fields = None
        elem_fields = None

    if overwrite:
        root_doc = "$$ROOT"

        if delete_fields:
            cond = {
                "$and": [
                    {"$ne": ["$$item.v", None]},
                    {"$not": {"$in": ["$$item.k", list(delete_fields)]}},
                ]
            }
        else:
            cond = {"$ne": ["$$item.v", None]}

        new_doc = {
            "$arrayToObject": {
                "$filter": {
                    "input": {"$objectToArray": "$$new"},
                    "as": "item",
                    "cond": cond,
                }
            }
        }

        docs = [root_doc, new_doc]
    else:
        if delete_fields:
            new_doc = {
                "$arrayToObject": {
                    "$filter": {
                        "input": {"$objectToArray": "$$new"},
                        "as": "item",
                        "cond": {
                            "$not": {"$in": ["$$item.k", list(delete_fields)]}
                        },
                    }
                }
            }
        else:
            new_doc = "$$new"

        root_doc = {
            "$arrayToObject": {
                "$filter": {
                    "input": {"$objectToArray": "$$ROOT"},
                    "as": "item",
                    "cond": {"$ne": ["$$item.v", None]},
                }
            }
        }

        docs = [new_doc, root_doc]

    if list_fields or elem_fields:
        doc = {}

        if list_fields:
            for list_field in list_fields:
                _merge_list_field(doc, list_field)

        if elem_fields:
            for elem_field in elem_fields:
                _merge_label_list_field(doc, elem_field, overwrite=overwrite)

        docs.append(doc)

    return [{"$replaceWith": {"$mergeObjects": docs}}]


def _merge_list_field(doc, list_field):
    doc[list_field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": ["$" + list_field, None]}},
                    "then": "$$new." + list_field,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + list_field, None]}},
                    "then": "$" + list_field,
                },
            ],
            "default": {
                "$concatArrays": [
                    "$" + list_field,
                    {
                        "$filter": {
                            "input": "$$new." + list_field,
                            "as": "this",
                            "cond": {
                                "$not": {"$in": ["$$this", "$" + list_field]}
                            },
                        }
                    },
                ]
            },
        }
    }


def _merge_label_list_field(doc, elem_field, overwrite=False):
    field, leaf = elem_field.split(".")

    if overwrite:
        root = "$$new." + field
        elements = {
            "$reverseArray": {
                "$let": {
                    "vars": {
                        "new_ids": {
                            "$map": {
                                "input": "$$new." + elem_field,
                                "as": "this",
                                "in": "$$this._id",
                            },
                        },
                    },
                    "in": {
                        "$reduce": {
                            "input": {"$reverseArray": "$" + elem_field},
                            "initialValue": {
                                "$reverseArray": "$$new." + elem_field
                            },
                            "in": {
                                "$cond": {
                                    "if": {
                                        "$not": {
                                            "$in": ["$$this._id", "$$new_ids"]
                                        }
                                    },
                                    "then": {
                                        "$concatArrays": [
                                            "$$value",
                                            ["$$this"],
                                        ]
                                    },
                                    "else": "$$value",
                                }
                            },
                        }
                    },
                }
            }
        }
    else:
        root = "$" + field
        elements = {
            "$let": {
                "vars": {
                    "existing_ids": {
                        "$map": {
                            "input": "$" + elem_field,
                            "as": "this",
                            "in": "$$this._id",
                        },
                    },
                },
                "in": {
                    "$reduce": {
                        "input": "$$new." + elem_field,
                        "initialValue": "$" + elem_field,
                        "in": {
                            "$cond": {
                                "if": {
                                    "$not": {
                                        "$in": ["$$this._id", "$$existing_ids"]
                                    }
                                },
                                "then": {
                                    "$concatArrays": ["$$value", ["$$this"]]
                                },
                                "else": "$$value",
                            }
                        },
                    }
                },
            }
        }

    doc[field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": ["$" + field, None]}},
                    "then": "$$new." + field,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + field, None]}},
                    "then": "$" + field,
                },
            ],
            "default": {"$mergeObjects": [root, {leaf: elements}]},
        }
    }


def _index_frames(sample_collection, key_field, frame_key_field):
    ids, keys, all_sample_ids = sample_collection.values(
        ["_id", key_field, "frames._sample_id"]
    )
    keys_map = {k: v for k, v in zip(ids, keys)}

    frame_keys = []
    for sample_ids in all_sample_ids:
        if sample_ids:
            sample_keys = [keys_map[_id] for _id in sample_ids]
        else:
            sample_keys = sample_ids

        frame_keys.append(sample_keys)

    sample_collection.set_values(
        "frames." + frame_key_field,
        frame_keys,
        expand_schema=False,
        _allow_missing=True,
    )


def _always_select_field(sample_collection, field):
    if not isinstance(sample_collection, fov.DatasetView):
        return sample_collection

    view = sample_collection

    if not any(isinstance(stage, fost.SelectFields) for stage in view._stages):
        return view

    # Manually insert `field` into all `SelectFields` stages
    _view = view._base_view
    for stage in view._stages:
        if isinstance(stage, fost.SelectFields):
            stage = fost.SelectFields(
                stage.field_names + [field], _allow_missing=True
            )

        _view = _view.add_stage(stage)

    return _view


def _finalize_frames(sample_collection, key_field, frame_key_field):
    results = sample_collection.values([key_field, "_id"])
    ids_map = {k: v for k, v in zip(*results)}

    frame_coll = sample_collection._dataset._frame_collection

    ops = [
        UpdateMany(
            {frame_key_field: key}, {"$set": {"_sample_id": ids_map[key]}}
        )
        for key in frame_coll.distinct(frame_key_field)
    ]

    foo.bulk_write(ops, frame_coll)


def _get_media_type(sample):
    for field, value in sample.iter_fields():
        if isinstance(value, fog.Group):
            return fom.GROUP

    return sample.media_type


def _get_group_field(schema):
    for field_name, field in schema.items():
        if isinstance(field, fof.EmbeddedDocumentField) and issubclass(
            field.document_type, fog.Group
        ):
            return field_name

    return None


def _get_sample_ids(arg):
    if etau.is_str(arg):
        return [arg]

    if isinstance(arg, (fos.Sample, fos.SampleView)):
        return [arg.id]

    if isinstance(arg, foc.SampleCollection):
        return arg.values("id")

    arg = list(arg)

    if not arg:
        return []

    if isinstance(arg[0], (fos.Sample, fos.SampleView)):
        return [sample.id for sample in arg]

    return arg


def _get_frame_ids(arg):
    if etau.is_str(arg):
        return [arg]

    if isinstance(arg, (fofr.Frame, fofr.FrameView)):
        return [arg.id]

    if isinstance(arg, (fos.Sample, fos.SampleView)):
        return _get_frame_ids_for_sample(arg)

    if isinstance(arg, foc.SampleCollection):
        return arg.values("frames.id", unwind=True)

    arg = list(arg)

    if not arg:
        return []

    if isinstance(arg[0], (fofr.Frame, fofr.FrameView)):
        return [frame.id for frame in arg]

    if isinstance(arg[0], (fos.Sample, fos.SampleView)):
        return itertools.chain.from_iterable(
            _get_frame_ids_for_sample(a) for a in arg
        )

    return arg


def _get_frame_ids_for_sample(sample):
    if sample.in_dataset:
        view = sample._collection.select(sample.id)
        return view.values("frames.id", unwind=True)

    return [frame.id for frame in sample.frames.values()]


def _get_group_ids(arg):
    if etau.is_str(arg):
        return [arg]

    if isinstance(arg, (dict, fos.Sample, fos.SampleView)):
        return [_get_group_id(arg)]

    if isinstance(arg, foc.SampleCollection):
        if arg.media_type != fom.GROUP:
            raise ValueError("%s is not a grouped collection" % type(arg))

        return arg.values(arg.group_field + ".id")

    arg = list(arg)

    if not arg:
        return []

    if isinstance(arg[0], (dict, fos.Sample, fos.SampleView)):
        return [_get_group_id(a) for a in arg]

    return arg


def _get_group_id(sample_or_group):
    if isinstance(sample_or_group, dict):
        sample = next(iter(sample_or_group.values()))
    else:
        sample = sample_or_group

    for field, value in sample.iter_fields():
        if isinstance(value, fog.Group):
            return value.id

    raise ValueError("Sample '%s' has no group" % sample.id)


def _to_list(arg):
    if etau.is_container(arg):
        return list(arg)

    return [arg]


def _parse_fields(field_names):
    field_names = _to_list(field_names)
    fields = [f for f in field_names if "." not in f]
    embedded_fields = [f for f in field_names if "." in f]
    return fields, embedded_fields


def _parse_field_mapping(field_mapping):
    fields = []
    new_fields = []
    embedded_fields = []
    embedded_new_fields = []
    for field, new_field in field_mapping.items():
        if "." in field or "." in new_field:
            embedded_fields.append(field)
            embedded_new_fields.append(new_field)
        else:
            fields.append(field)
            new_fields.append(new_field)

    return fields, new_fields, embedded_fields, embedded_new_fields


def _extract_archive_if_necessary(archive_path, cleanup):
    dataset_dir = etau.split_archive(archive_path)[0]

    if not os.path.isdir(dataset_dir):
        etau.extract_archive(archive_path, delete_archive=cleanup)

        if not os.path.isdir(dataset_dir):
            raise ValueError(
                "Expected to find a directory '%s' after extracting '%s', "
                "but it was not found" % (dataset_dir, archive_path)
            )
    else:
        logger.info(
            "Assuming '%s' contains the extracted contents of '%s'",
            dataset_dir,
            archive_path,
        )

    return dataset_dir
