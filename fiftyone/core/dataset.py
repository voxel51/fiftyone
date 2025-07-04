"""
FiftyOne datasets.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from collections import defaultdict
from functools import partial
import contextlib
from datetime import datetime
import fnmatch
import itertools
import logging
import numbers
import os
import random
import string

from bson import json_util, ObjectId, DBRef
import cachetools
from deprecated import deprecated
import mongoengine.errors as moe
from pymongo import (
    DeleteMany,
    InsertOne,
    ReplaceOne,
    UpdateMany,
    UpdateOne,
)
from pymongo.collection import Collection
from pymongo.errors import CursorNotFound, BulkWriteError

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as focn
import fiftyone.core.collections as foc
import fiftyone.core.expressions as foe
from fiftyone.core.expressions import ViewField as F
import fiftyone.core.fields as fof
import fiftyone.core.frame as fofr
import fiftyone.core.groups as fog
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fome
from fiftyone.core.odm.dataset import DatasetAppConfig
import fiftyone.migrations as fomi
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos
import fiftyone.core.storage as fost
from fiftyone.core.singletons import DatasetSingleton
import fiftyone.core.utils as fou
import fiftyone.core.view as fov

fot = fou.lazy_import("fiftyone.core.stages")
foud = fou.lazy_import("fiftyone.utils.data")
foos = fou.lazy_import("fiftyone.operators.store")


_SUMMARY_FIELD_KEY = "_summary_field"

logger = logging.getLogger(__name__)


class DatasetNotFoundError(ValueError):
    """Exception raised when a dataset is not found."""

    def __init__(self, name):
        self._dataset_name = name
        super().__init__(f"Dataset {name} not found")


def list_datasets(glob_patt=None, tags=None, info=False):
    """Lists the available FiftyOne datasets.

    Args:
        glob_patt (None): an optional glob pattern of names to return
        tags (None): only include datasets that have the specified tag or list
            of tags
        info (False): whether to return info dicts describing each dataset
            rather than just their names

    Returns:
        a list of dataset names or info dicts
    """
    if info:
        return _list_datasets_info(glob_patt=glob_patt, tags=tags)

    return _list_datasets(glob_patt=glob_patt, tags=tags)


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

    clashing_name_doc = conn.datasets.find_one(
        query, {"name": True, "_id": False}
    )
    if clashing_name_doc is not None:
        clashing_name = clashing_name_doc["name"]
        if clashing_name == name:
            raise ValueError(f"Dataset name '{name}' is not available")
        else:
            raise ValueError(
                f"Dataset name '{name}' is not available: slug '{slug}' "
                f"in use by dataset '{clashing_name}'"
            )

    return slug


def load_dataset(name, create_if_necessary=False):
    """Loads the FiftyOne dataset with the given name.

    To create a new dataset, use the :class:`Dataset` constructor.

    .. note::

        :class:`Dataset` instances are singletons keyed by their name, so all
        calls to this method with a given dataset ``name`` in a program will
        return the same object.

    Args:
        name: the name of the dataset
        create_if_necessary (False): if no dataset exists, create an empty one

    Raises:
        DatasetNotFoundError: if the dataset does not exist and
            `create_if_necessary` is False

    Returns:
        a :class:`Dataset`
    """
    try:
        return Dataset(name, _create=False)
    except DatasetNotFoundError as ex:
        if create_if_necessary:
            return Dataset(name, _create=True)
        else:
            raise ex


def get_default_dataset_name():
    """Returns a default dataset name based on the current time.

    Returns:
        a dataset name
    """
    now = datetime.now()
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
    for name in _list_datasets(glob_patt=glob_patt):
        delete_dataset(name, verbose=verbose)


def delete_non_persistent_datasets(verbose=False):
    """Deletes all non-persistent datasets.

    Args:
        verbose (False): whether to log the names of deleted datasets
    """
    _delete_non_persistent_datasets(verbose=verbose)


def _delete_non_persistent_datasets(verbose=False):
    conn = foo.get_db_conn()

    for name in conn.datasets.find({"persistent": False}).distinct("name"):
        try:
            dataset = Dataset(name, _create=False, _virtual=True)
        except:
            # If the dataset can't be loaded, it likely requires migration,
            # which means it is persistent, so we don't worry about it here
            continue

        if not dataset.persistent and not dataset.deleted:
            dataset._delete()
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

    __slots__ = (
        "_doc",
        "_sample_doc_cls",
        "_frame_doc_cls",
        "_group_slice",
        "_annotation_cache",
        "_brain_cache",
        "_evaluation_cache",
        "_run_cache",
        "_deleted",
    )

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
        self._run_cache = cachetools.LRUCache(5)

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

    def _estimated_count(self, frames=False):
        if frames:
            if self._frame_collection is None:
                return None

            return self._frame_collection.estimated_document_count()

        return self._sample_collection.estimated_document_count()

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

        return self._make_sample(d)

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
    def _is_dynamic_groups(self):
        return False

    @property
    def media_type(self):
        """The media type of the dataset."""
        return self._doc.media_type

    @media_type.setter
    def media_type(self, media_type):
        if media_type == self._doc.media_type:
            return

        if len(self) > 0:
            raise ValueError("Cannot set media type of a non-empty dataset")

        self._set_media_type(media_type)

    def _set_media_type(self, media_type):
        self._doc.media_type = media_type

        if self._contains_videos(any_slice=True):
            self._init_frames()

        if media_type == fom.GROUP:
            # The `metadata` field of group datasets always stays as the
            # generic `Metadata` type because slices may have different types
            self.save()
        else:
            self._update_metadata_field(media_type)

            self.save()
            self.reload()

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
            field_doc._set_created_at(datetime.utcnow())

            self._doc.sample_fields[idx] = field_doc

    def _init_frames(self):
        if self._frame_doc_cls is not None:
            # Legacy datasets may not have frame fields declared yet
            if not self._doc.frame_fields:
                self._doc.frame_fields = [
                    foo.SampleFieldDocument.from_field(field)
                    for field in self._frame_doc_cls._fields.values()
                ]

            return

        frame_collection_name = _make_frame_collection_name(
            self._sample_collection_name
        )
        frame_doc_cls = _create_frame_document_cls(
            self, frame_collection_name, field_docs=self._doc.frame_fields
        )

        _create_indexes(None, frame_collection_name)

        self._doc.frame_collection_name = frame_collection_name
        self._doc.frame_fields = [
            foo.SampleFieldDocument.from_field(field)
            for field in frame_doc_cls._fields.values()
        ]
        self._frame_doc_cls = frame_doc_cls

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

        if (
            slice_name is not None
            and slice_name not in self._doc.group_media_types
        ):
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
        self.save()

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
        self.save()

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
    def last_modified_at(self):
        """The datetime that dataset-level metadata was last modified.

        This property is incremented in the following cases:

        -   when properties such as :attr:`name`, :attr:`persistent`,
            :attr:`tags`, :attr:`description`, :attr:`info`, and
            :attr:`app_config` are edited
        -   when fields are added or deleted from the dataset's schema
        -   when group slices are added or deleted from the dataset's schema
        -   when saved views or workspaces are added, edited, or deleted
        -   when annotation, brain, evaluation, or custom runs are added,
            edited, or deleted

        This property is **not** updated when samples are added, edited, or
        deleted. Use
        :meth:`max("last_modified_at") <fiftyone.core.collections.SampleCollection.max>`
        to determine when samples were last added or edited, and use
        :attr:`last_deletion_at` to determine when samples were last deleted.
        """
        return self._doc.last_modified_at

    @property
    def last_deletion_at(self):
        """The datetime that a sample was last deleted from the dataset, or
        ``None`` if no samples have been deleted.
        """
        return self._doc.last_deletion_at

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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
        self.save()

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

    def stats(
        self,
        include_media=False,
        include_indexes=False,
        compressed=False,
    ):
        """Returns stats about the dataset on disk.

        The ``samples`` keys refer to the sample documents stored in the
        database.

        For video datasets, the ``frames`` keys refer to the frame documents
        stored in the database.

        The ``media`` keys refer to the raw media associated with each sample
        on disk.

        The ``index[es]`` keys refer to the indexes associated with the
        dataset.

        Note that dataset-level metadata such as annotation runs are not
        included in this computation.

        Args:
            include_media (False): whether to include stats about the size of
                the raw media in the dataset
            include_indexes (False): whether to include stats on the dataset's
                indexes
            compressed (False): whether to return the sizes of collections in
                their compressed form on disk (True) or the logical
                uncompressed size of the collections (False)

        Returns:
            a stats dict
        """
        contains_videos = self._contains_videos(any_slice=True)

        stats = {}

        cs = self._sample_collstats()
        samples_bytes = cs["storageSize"] if compressed else cs["size"]
        stats["samples_count"] = cs["count"]
        stats["samples_bytes"] = samples_bytes
        stats["samples_size"] = etau.to_human_bytes_str(samples_bytes)
        total_bytes = samples_bytes

        if contains_videos:
            cs = self._frame_collstats()
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

        if include_indexes:
            ii = self.get_index_information(include_stats=True)
            index_bytes = {k: v["size"] for k, v in ii.items()}
            indexes_bytes = sum(index_bytes.values())
            indexes_in_progress = [
                k for k, v in ii.items() if v.get("in_progress", False)
            ]

            stats["indexes_count"] = len(index_bytes)
            stats["indexes_bytes"] = indexes_bytes
            stats["indexes_size"] = etau.to_human_bytes_str(indexes_bytes)
            stats["indexes_in_progress"] = indexes_in_progress
            stats["index_bytes"] = index_bytes
            stats["index_sizes"] = {
                k: etau.to_human_bytes_str(v) for k, v in index_bytes.items()
            }
            total_bytes += indexes_bytes

        stats["total_bytes"] = total_bytes
        stats["total_size"] = etau.to_human_bytes_str(total_bytes)

        return stats

    def _sample_collstats(self):
        return _get_collstats(self._sample_collection)

    def _frame_collstats(self):
        if self._frame_collection_name is None:
            return None

        return _get_collstats(self._frame_collection)

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

    def one(self, expr, exact=False):
        """Returns a single sample in this dataset matching the expression.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart")

            #
            # Get a sample by filepath
            #

            # A random filepath in the dataset
            filepath = dataset.take(1).first().filepath

            # Get sample by filepath
            sample = dataset.one(F("filepath") == filepath)

            #
            # Dealing with multiple matches
            #

            # Get a sample whose image is JPEG
            sample = dataset.one(F("filepath").ends_with(".jpg"))

            # Raises an error since there are multiple JPEGs
            dataset.one(F("filepath").ends_with(".jpg"), exact=True)

        Args:
            expr: a :class:`fiftyone.core.expressions.ViewExpression` or
                `MongoDB expression <https://docs.mongodb.com/manual/meta/aggregation-quick-reference/#aggregation-expressions>`_
                that evaluates to ``True`` for the sample to match
            exact (False): whether to raise an error if multiple samples match
                the expression

        Returns:
            a :class:`fiftyone.core.sample.Sample`
        """
        view = self.match(expr)
        matches = iter(view._aggregate())

        try:
            d = next(matches)
        except StopIteration:
            raise ValueError("No samples match the given expression")

        if exact:
            try:
                next(matches)
                raise ValueError(
                    "Expected one matching sample, but found %d matches"
                    % len(view)
                )
            except StopIteration:
                pass

        return self._make_sample(d)

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
        subfield=None,
        read_only=None,
        info_keys=None,
        created_after=None,
        include_private=False,
        flat=False,
        unwind=True,
        mode=None,
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
            subfield (None): an optional subfield type or iterable of subfield
                types to which to restrict the returned schema. Must be
                subclass(es) of :class:`fiftyone.core.fields.Field`
            read_only (None): whether to restrict to (True) or exclude (False)
                read-only fields. By default, all fields are included
            info_keys (None): an optional key or list of keys that must be in
                the field's ``info`` dict
            created_after (None): an optional ``datetime`` specifying a minimum
                creation date
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys
            unwind (True): whether to traverse into list fields. Only
                applicable when ``flat=True``
            mode (None): whether to apply the above constraints before and/or
                after flattening the schema. Only applicable when ``flat=True``.
                Supported values are ``("before", "after", "both")``. The
                default is ``"after"``

        Returns:
            a dict mapping field names to :class:`fiftyone.core.fields.Field`
            instances
        """
        return self._sample_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            read_only=read_only,
            info_keys=info_keys,
            created_after=created_after,
            include_private=include_private,
            flat=flat,
            unwind=unwind,
            mode=mode,
        )

    def get_frame_field_schema(
        self,
        ftype=None,
        embedded_doc_type=None,
        subfield=None,
        read_only=None,
        info_keys=None,
        created_after=None,
        include_private=False,
        flat=False,
        unwind=True,
        mode=None,
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
            subfield (None): an optional subfield type or iterable of subfield
                types to which to restrict the returned schema. Must be
                subclass(es) of :class:`fiftyone.core.fields.Field`
            read_only (None): whether to restrict to (True) or exclude (False)
                read-only fields. By default, all fields are included
            info_keys (None): an optional key or list of keys that must be in
                the field's ``info`` dict
            created_after (None): an optional ``datetime`` specifying a minimum
                creation date
            include_private (False): whether to include fields that start with
                ``_`` in the returned schema
            flat (False): whether to return a flattened schema where all
                embedded document fields are included as top-level keys
            unwind (True): whether to traverse into list fields. Only
                applicable when ``flat=True``
            mode (None): whether to apply the above constraints before and/or
                after flattening the schema. Only applicable when ``flat=True``.
                Supported values are ``("before", "after", "both")``. The
                default is ``"after"``

        Returns:
            a dict mapping field names to :class:`fiftyone.core.fields.Field`
            instances, or ``None`` if the dataset does not contain videos
        """
        if not self._has_frame_fields():
            return None

        return self._frame_doc_cls.get_field_schema(
            ftype=ftype,
            embedded_doc_type=embedded_doc_type,
            subfield=subfield,
            read_only=read_only,
            info_keys=info_keys,
            created_after=created_after,
            include_private=include_private,
            flat=flat,
            unwind=unwind,
            mode=mode,
        )

    def add_sample_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        read_only=False,
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
            read_only (False): whether the field should be read-only

        Raises:
            ValueError: if a field of the same name already exists and it is
                not compliant with the specified values
        """
        if embedded_doc_type is not None and issubclass(
            embedded_doc_type, fog.Group
        ):
            expanded = self._add_group_field(
                field_name,
                description=description,
                info=info,
                read_only=read_only,
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
                read_only=read_only,
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

    def add_dynamic_sample_fields(
        self, fields=None, recursive=True, add_mixed=False
    ):
        """Adds all dynamic sample fields to the dataset's schema.

        Dynamic fields are embedded document fields with at least one non-None
        value that have not been declared on the dataset's schema.

        Args:
            fields (None): an optional field or iterable of fields for which to
                add dynamic fields. By default, all fields are considered
            recursive (True): whether to recursively inspect nested lists and
                embedded documents for dynamic fields
            add_mixed (False): whether to declare fields that contain values
                of mixed types as generic :class:`fiftyone.core.fields.Field`
                instances (True) or to skip such fields (False)
        """
        dynamic_schema = self.get_dynamic_field_schema(
            fields=fields, recursive=recursive
        )

        schema = {}
        for path, field in dynamic_schema.items():
            if isinstance(field, fof.ListField) and etau.is_container(
                field.field
            ):
                if add_mixed:
                    field.field = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic list field '%s' with mixed types %s",
                        path,
                        [type(f) for f in field.field],
                    )
                    field = None
            elif etau.is_container(field):
                if add_mixed:
                    field = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic field '%s' with mixed types %s",
                        path,
                        [type(f) for f in field],
                    )
                    field = None

            if field is not None:
                schema[path] = field

        for _schema in _handle_nested_fields(schema):
            self._merge_sample_field_schema(_schema)

    def add_frame_field(
        self,
        field_name,
        ftype,
        embedded_doc_type=None,
        subfield=None,
        fields=None,
        description=None,
        info=None,
        read_only=False,
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
            read_only (False): whether the field should be read-only

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
            read_only=read_only,
            **kwargs,
        )

        if expanded:
            self._reload()

    def list_summary_fields(self):
        """Lists the summary fields on the dataset.

        Use :meth:`create_summary_field` to create summary fields, and use
        :meth:`delete_summary_field` to delete them.

        Returns:
            a list of summary field names
        """
        return sorted(
            self.get_field_schema(flat=True, info_keys=_SUMMARY_FIELD_KEY)
        )

    def _get_summarized_fields_map(self):
        schema = self.get_field_schema(flat=True, info_keys=_SUMMARY_FIELD_KEY)

        summarized_fields = {}
        for path, field in schema.items():
            summary_info = field.info[_SUMMARY_FIELD_KEY]
            source_path = summary_info.get("path", None)
            if source_path is not None:
                summarized_fields[source_path] = path

        return summarized_fields

    def create_summary_field(
        self,
        path,
        field_name=None,
        sidebar_group=None,
        include_counts=False,
        group_by=None,
        read_only=True,
        create_index=True,
    ):
        """Populates a sample-level field that records the unique values or
        numeric ranges that appear in the specified field on each sample in
        the dataset.

        This method is particularly useful for summarizing frame-level fields
        of video datasets, in which case the sample-level field records the
        unique values or numeric ranges that appear in the specified
        frame-level field across all frames of that sample. This summary field
        can then be efficiently queried to retrieve samples that contain
        specific values of interest in at least one frame.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz
            from fiftyone import ViewField as F

            dataset = foz.load_zoo_dataset("quickstart-video")
            dataset.set_field("frames.detections.detections.confidence", F.rand()).save()

            # Generate a summary field for object labels
            dataset.create_summary_field("frames.detections.detections.label")

            # Generate a summary field for [min, max] confidences
            dataset.create_summary_field("frames.detections.detections.confidence")

            # Generate a summary field for object labels and counts
            dataset.create_summary_field(
                "frames.detections.detections.label",
                field_name="frames_detections_label2",
                include_counts=True,
            )

            # Generate a summary field for per-label [min, max] confidences
            dataset.create_summary_field(
                "frames.detections.detections.confidence",
                field_name="frames_detections_confidence2",
                group_by="label",
            )

            print(dataset.list_summary_fields())

        Args:
            path: an input field path
            field_name (None): the sample-level field in which to store the
                summary data. By default, a suitable name is derived from the
                given ``path``
            sidebar_group (None): the name of a
                :ref:`App sidebar group <app-sidebar-groups>` to which to add
                the summary field. By default, all summary fields are added to
                a ``"summaries"`` group. You can pass ``False`` to skip sidebar
                group modification
            include_counts (False): whether to include per-value counts when
                summarizing categorical fields
            group_by (None): an optional attribute to group by when ``path``
                is a numeric field to generate per-attribute ``[min, max]``
                ranges. This may either be an absolute path or an attribute
                name that is interpreted relative to ``path``
            read_only (True): whether to mark the summary field as read-only
            create_index (True): whether to create database index(es) for the
                summary field

        Returns:
            the summary field name
        """
        _field = self.get_field(path)

        is_list_field = isinstance(_field, fof.ListField)
        if is_list_field:
            _field = _field.field

        if isinstance(
            _field,
            (fof.StringField, fof.BooleanField, fof.ObjectIdField),
        ):
            field_type = "categorical"
        elif isinstance(
            _field,
            (fof.FloatField, fof.IntField, fof.DateField, fof.DateTimeField),
        ):
            field_type = "numeric"
        elif is_list_field:
            raise ValueError(
                f"Cannot generate a summary for list field '{path}' with "
                f"element type {type(_field)}"
            )
        elif _field is not None:
            raise ValueError(
                f"Cannot generate a summary for field '{path}' of "
                f"type {type(_field)}"
            )
        else:
            raise ValueError(
                "Cannot generate a summary field for non-existent or "
                f"undeclared field '{path}'"
            )

        if field_name is None:
            field_name = self._get_default_summary_field_name(path)

        index_fields = []
        summary_info = {"path": path, "field_type": field_type}
        if field_type == "categorical":
            summary_info["include_counts"] = include_counts
            if include_counts:
                label_field = field_name + ".label"
                count_field = field_name + ".count"
                index_fields.extend([label_field, count_field])

                self.add_sample_field(
                    field_name,
                    fof.ListField,
                    subfield=fof.EmbeddedDocumentField,
                    embedded_doc_type=foo.DynamicEmbeddedDocument,
                    info={_SUMMARY_FIELD_KEY: summary_info},
                )
                self.add_sample_field(label_field, type(_field))
                self.add_sample_field(count_field, fof.IntField)
            else:
                index_fields.append(field_name)
                self.add_sample_field(
                    field_name,
                    fof.ListField,
                    subfield=type(_field),
                    info={_SUMMARY_FIELD_KEY: summary_info},
                )
        elif field_type == "numeric":
            summary_info["group_by"] = group_by
            if group_by is not None:
                if "." in group_by:
                    value = group_by.rsplit(".", 1)[1]
                    group_path = group_by
                else:
                    value = group_by
                    group_path = path.rsplit(".", 1)[0] + "." + group_by

                _group_field = self.get_field(group_path)

                value_field = field_name + f".{value}"
                min_field = field_name + ".min"
                max_field = field_name + ".max"
                index_fields.extend([value_field, min_field, max_field])

                self.add_sample_field(
                    field_name,
                    fof.ListField,
                    subfield=fof.EmbeddedDocumentField,
                    embedded_doc_type=foo.DynamicEmbeddedDocument,
                    info={_SUMMARY_FIELD_KEY: summary_info},
                )
                self.add_sample_field(value_field, type(_group_field))
                self.add_sample_field(min_field, type(_field))
                self.add_sample_field(max_field, type(_field))
            else:
                min_field = field_name + ".min"
                max_field = field_name + ".max"
                index_fields.extend([min_field, max_field])

                self.add_sample_field(
                    field_name,
                    fof.EmbeddedDocumentField,
                    embedded_doc_type=foo.DynamicEmbeddedDocument,
                    info={_SUMMARY_FIELD_KEY: summary_info},
                )
                self.add_sample_field(min_field, type(_field))
                self.add_sample_field(max_field, type(_field))

        if sidebar_group is not False:
            if sidebar_group is None:
                sidebar_group = "summaries"

            self.app_config._add_path_to_sidebar_group(
                field_name,
                sidebar_group,
                after_group="labels",
                dataset=self,
            )

        if create_index:
            for _field_name in index_fields:
                self.create_index(_field_name)

        field = self.get_field(field_name)
        field.info[_SUMMARY_FIELD_KEY]["last_modified_at"] = field.created_at

        if read_only:
            field.read_only = True

        field.save()

        self._populate_summary_field(field_name, summary_info)

        return field_name

    def _get_default_summary_field_name(self, path):
        (
            _path,
            is_frame_field,
            list_fields,
            _,
            id_to_str,
        ) = self._parse_field_name(path)

        _chunks = _path.split(".")
        if id_to_str:
            _chunks = [c[1:] if c.startswith("_") else c for c in _chunks]

        chunks = []
        if is_frame_field:
            chunks.append("frames")

        found_list = False
        for i, _chunk in enumerate(_chunks, 1):
            if ".".join(_chunks[:i]) in list_fields:
                found_list = True
                break
            else:
                chunks.append(_chunk)

        if found_list:
            chunks.append(_chunks[-1])

        field_name = "_".join(chunks)

        if field_name == path:
            field_name += "_summary"

        return field_name

    def _populate_summary_field(self, field_name, summary_info):
        path = summary_info["path"]
        field_type = summary_info["field_type"]
        include_counts = summary_info.get("include_counts", False)
        group_by = summary_info.get("group_by", None)

        _path, is_frame_field, list_fields, _, _ = self._parse_field_name(path)

        pipeline = []

        if is_frame_field:
            pipeline.extend(
                [
                    {"$unwind": "$frames"},
                    {"$replaceRoot": {"newRoot": "$frames"}},
                ]
            )
            _id = "_sample_id"
        else:
            _id = "_id"

        for list_field in list_fields:
            pipeline.append({"$unwind": "$" + list_field})

        if field_type == "categorical":
            if include_counts:
                value = path.rsplit(".", 1)[-1]
                pipeline.extend(
                    [
                        {
                            "$group": {
                                "_id": {
                                    "sample": "$" + _id,
                                    "value": "$" + _path,
                                },
                                "count": {"$sum": 1},
                            },
                        },
                        {"$match": {"$expr": {"$gt": ["$_id.value", None]}}},
                        {
                            "$group": {
                                "_id": "$_id.sample",
                                field_name: {
                                    "$push": {
                                        value: "$_id.value",
                                        "count": "$count",
                                    }
                                },
                            },
                        },
                    ]
                )
            else:
                pipeline.extend(
                    [
                        {
                            "$group": {
                                "_id": "$" + _id,
                                "values": {"$addToSet": "$" + _path},
                            },
                        },
                        {
                            "$project": {
                                field_name: {
                                    "$filter": {
                                        "input": "$values",
                                        "cond": {"$gt": ["$$this", None]},
                                    }
                                }
                            }
                        },
                    ]
                )
        elif field_type == "numeric":
            if group_by is not None:
                if "." in group_by:
                    value = group_by.rsplit(".", 1)[1]
                    group_path = group_by
                else:
                    value = group_by
                    group_path = path.rsplit(".", 1)[0] + "." + group_by

                _group_path, _ = self._handle_frame_field(group_path)

                pipeline.extend(
                    [
                        {
                            "$group": {
                                "_id": {
                                    "sample": "$" + _id,
                                    "value": "$" + _group_path,
                                },
                                "min": {"$min": "$" + _path},
                                "max": {"$max": "$" + _path},
                            },
                        },
                        {"$match": {"$expr": {"$gt": ["$_id.value", None]}}},
                        {
                            "$group": {
                                "_id": "$_id.sample",
                                field_name: {
                                    "$push": {
                                        value: "$_id.value",
                                        "min": "$min",
                                        "max": "$max",
                                    }
                                },
                            }
                        },
                    ]
                )
            else:
                pipeline.extend(
                    [
                        {
                            "$group": {
                                "_id": "$" + _id,
                                "min": {"$min": "$" + _path},
                                "max": {"$max": "$" + _path},
                            },
                        },
                        {
                            "$project": {
                                field_name: {"min": "$min", "max": "$max"}
                            }
                        },
                    ]
                )

        pipeline.append(
            {
                "$merge": {
                    "into": self._sample_collection_name,
                    "on": "_id",
                    "whenMatched": "merge",
                    "whenNotMatched": "discard",
                }
            }
        )

        self._aggregate(pipeline=pipeline, attach_frames=is_frame_field)

        fos.Sample._reload_docs(self._sample_collection_name)

    def check_summary_fields(self):
        """Returns a list of summary fields that **may** need to be updated.

        Summary fields may need to be updated whenever there have been
        modifications to the dataset's samples since the summaries were last
        generated.

        Note that inclusion in this list is only a heuristic, as any sample
        modifications may not have affected the summary's source field.

        Returns:
            list of summary field names
        """
        summary_schema = self.get_field_schema(
            flat=True, info_keys=_SUMMARY_FIELD_KEY
        )

        update_indexes = []
        samples_last_modified_at = None
        frames_last_modified_at = None
        for path, field in summary_schema.items():
            summary_info = field.info[_SUMMARY_FIELD_KEY]
            source_path = summary_info.get("path", None)
            last_modified_at = summary_info.get("last_modified_at", None)

            if source_path is None:
                continue
            elif last_modified_at is None:
                update_indexes.append(path)
            elif self._is_frame_field(source_path):
                if frames_last_modified_at is None:
                    frames_last_modified_at = self._max(
                        "frames.last_modified_at"
                    )

                if frames_last_modified_at > last_modified_at:
                    update_indexes.append(path)
            else:
                if samples_last_modified_at is None:
                    samples_last_modified_at = self._max("last_modified_at")

                if samples_last_modified_at > last_modified_at:
                    update_indexes.append(path)

        return update_indexes

    def update_summary_field(self, field_name):
        """Updates the summary field based on the current values of its source
        field.

        Args:
            field_name: the summary field
        """

        # This prevents a "weakly-referenced object no longer exists" error
        # from occurring when updating multiple summary fields sequentially
        # @todo diagnose and cure root cause so this isn't needed
        self._reload(hard=True)

        field = self.get_field(field_name)
        if field is None or _SUMMARY_FIELD_KEY not in field.info:
            raise ValueError(f"Field {field_name} is not a summary field")

        summary_info = field.info[_SUMMARY_FIELD_KEY]
        summary_info["last_modified_at"] = datetime.utcnow()
        field.save(_enforce_read_only=False)

        self._populate_summary_field(field_name, summary_info)

    def delete_summary_field(self, field_name, error_level=0):
        """Deletes the summary field from all samples in the dataset.

        Args:
            field_name: the summary field
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a summary field cannot be deleted
            -   1: log warning if a summary field cannot be deleted
            -   2: ignore summary fields that cannot be deleted
        """
        self._delete_summary_fields(field_name, error_level)

    def delete_summary_fields(self, field_names, error_level=0):
        """Deletes the summary fields from all samples in the dataset.

        Args:
            field_names: the summary field or iterable of summary fields
            error_level (0): the error level to use. Valid values are:

            -   0: raise error if a summary field cannot be deleted
            -   1: log warning if a summary field cannot be deleted
            -   2: ignore summary fields that cannot be deleted
        """
        self._delete_summary_fields(field_names, error_level)

    def _delete_summary_fields(self, field_names, error_level):
        field_names = _to_list(field_names)

        _field_names = []
        for field_name in field_names:
            field = self.get_field(field_name)

            if field is None or _SUMMARY_FIELD_KEY not in field.info:
                fou.handle_error(
                    ValueError(f"Field {field_name} is not a summary field"),
                    error_level,
                )
            else:
                if field.read_only:
                    field.read_only = False
                    field.save()

                _field_names.append(field_name)

        if _field_names:
            self._delete_sample_fields(_field_names, error_level)

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

    def add_dynamic_frame_fields(
        self, fields=None, recursive=True, add_mixed=False
    ):
        """Adds all dynamic frame fields to the dataset's schema.

        Dynamic fields are embedded document fields with at least one non-None
        value that have not been declared on the dataset's schema.

        Args:
            fields (None): an optional field or iterable of fields for which to
                add dynamic fields. By default, all fields are considered
            recursive (True): whether to recursively inspect nested lists and
                embedded documents for dynamic fields
            add_mixed (False): whether to declare fields that contain values
                of mixed types as generic :class:`fiftyone.core.fields.Field`
                instances (True) or to skip such fields (False)
        """
        if not self._has_frame_fields():
            raise ValueError(
                "Only datasets that contain videos may have frame fields"
            )

        dynamic_schema = self.get_dynamic_frame_field_schema(
            fields=fields, recursive=recursive
        )

        schema = {}
        for path, field in dynamic_schema.items():
            if isinstance(field, fof.ListField) and etau.is_container(
                field.field
            ):
                if add_mixed:
                    field.field = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic list frame field '%s' with mixed "
                        "types %s",
                        path,
                        [type(f) for f in field.field],
                    )
                    field = None
            elif etau.is_container(field):
                if add_mixed:
                    field = fof.Field()
                else:
                    logger.warning(
                        "Skipping dynamic frame field '%s' with mixed types %s",
                        path,
                        [type(f) for f in field],
                    )
                    field = None

            if field is not None:
                schema[path] = field

        for _schema in _handle_nested_fields(schema):
            self._merge_frame_field_schema(_schema)

    def add_group_field(
        self,
        field_name,
        default=None,
        description=None,
        info=None,
        read_only=False,
    ):
        """Adds a group field to the dataset, if necessary.

        Args:
            field_name: the field name
            default (None): a default group slice for the field
            description (None): an optional description
            info (None): an optional info dict
            read_only (False): whether the field should be read-only

        Raises:
            ValueError: if a group field with another name already exists
        """
        expanded = self._add_group_field(
            field_name,
            default=default,
            description=description,
            info=info,
            read_only=read_only,
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
        self.save()

        self._group_slice = self._doc.default_group_slice

        _create_group_indexes(self._sample_collection_name, field_name)

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

        You can use dot notation (``embedded.field.name``) to clear embedded
        fields.

        Args:
            field_name: the field name or ``embedded.field.name``
        """
        self._clear_sample_fields(field_name)

    def clear_sample_fields(self, field_names):
        """Clears the values of the fields from all samples in the dataset.

        The field will remain in the dataset's schema, and all samples will
        have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clear embedded
        fields.

        Args:
            field_names: the field name or iterable of field names
        """
        self._clear_sample_fields(field_names)

    def clear_frame_field(self, field_name):
        """Clears the values of the frame-level field from all samples in the
        dataset.

        The field will remain in the dataset's frame schema, and all frames
        will have the value ``None`` for the field.

        You can use dot notation (``embedded.field.name``) to clear embedded
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

        You can use dot notation (``embedded.field.name``) to clear embedded
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

        fields, _ = _parse_fields(field_names)

        if fields:
            fos.Sample._purge_fields(self._sample_collection_name, fields)

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

        fields, _ = _parse_fields(field_names)

        if fields:
            fofr.Frame._purge_fields(self._frame_collection_name, fields)

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

    def add_group_slice(self, name, media_type):
        """Adds a group slice with the given media type to the dataset, if
        necessary.

        Args:
            name: a group slice name
            media_type: the media type of the slice
        """
        if self.media_type != fom.GROUP:
            raise ValueError("Dataset has no groups")

        existing_media_type = self._doc.group_media_types.get(name, None)
        if existing_media_type is not None:
            if media_type == existing_media_type:
                return

            raise ValueError(
                "Group slice '%s' with media type %s != %s already exists"
                % (name, existing_media_type, media_type)
            )

        rev_media_types = {
            v: k for k, v in self._doc.group_media_types.items()
        }
        if (
            fom.THREE_D in rev_media_types
            and rev_media_types[fom.THREE_D] != name
            and media_type == fom.THREE_D
        ):
            raise ValueError(
                "Only one 'fo3d' group slice is allowed, '%s' already exists"
                % rev_media_types[fom.THREE_D]
            )

        # If this is the first video slice, we need to initialize frames
        if media_type == fom.VIDEO and not any(
            slice_media_type == fom.VIDEO
            for slice_media_type in self._doc.group_media_types.values()
        ):
            self._init_frames()

        self._doc.group_media_types[name] = media_type

        # If dataset doesn't yet have a default group slice, assign it
        if self._doc.default_group_slice is None:
            self._doc.default_group_slice = name
            self._group_slice = name

        self.save()

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

        # Reload these fields to be safer against concurrent edits. Because
        #   the default_group_slice could've been changed elsewhere so we need
        #   to know we have the latest values.
        self._doc.reload("group_media_types", "default_group_slice")

        # DON'T use pop()! https://github.com/voxel51/fiftyone/issues/4322
        new_media_type = self._doc.group_media_types[name]
        del self._doc.group_media_types[name]

        self._doc.group_media_types[new_name] = new_media_type

        if self._doc.default_group_slice == name:
            self._doc.default_group_slice = new_name

        if self.group_slice == name:
            self.group_slice = new_name

        self.save()

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

        # Reload these fields to be safer against concurrent edits. Because
        #   the default_group_slice could've been changed elsewhere so we need
        #   to know we have the latest values.
        self._doc.reload("group_media_types", "default_group_slice")

        # DON'T use pop()! https://github.com/voxel51/fiftyone/issues/4322
        if name in self._doc.group_media_types:
            del self._doc.group_media_types[name]

        new_default = next(iter(self._doc.group_media_types.keys()), None)

        if self._doc.default_group_slice == name:
            self._doc.default_group_slice = new_default

        if self._group_slice == name:
            self._group_slice = new_default

        self.save()

    def iter_samples(
        self,
        progress=False,
        autosave=False,
        batch_size=None,
        batching_strategy=None,
    ):
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

            # Save using default batching strategy
            for sample in dataset.iter_samples(progress=True, autosave=True):
                sample.ground_truth.label = make_label()

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
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): the batch size to use when autosaving samples.
                If a ``batching_strategy`` is provided, this parameter
                configures the strategy as described below. If no
                ``batching_strategy`` is provided, this can either be an
                integer specifying the number of samples to save in a batch
                (in which case ``batching_strategy`` is implicitly set to
                ``"static"``) or a float number of seconds between batched
                saves (in which case ``batching_strategy`` is implicitly set to
                ``"latency"``)
            batching_strategy (None): the batching strategy to use for each
                save operation when autosaving samples. Supported values are:

                -   ``"static"``: a fixed sample batch size for each save
                -   ``"size"``: a target batch size, in bytes, for each save
                -   ``"latency"``: a target latency, in seconds, between saves

                By default, ``fo.config.default_batcher`` is used

        Returns:
            an iterator over :class:`fiftyone.core.sample.Sample` instances
        """
        with contextlib.ExitStack() as exit_context:
            samples = self._iter_samples()

            pb = fou.ProgressBar(total=self, progress=progress)
            exit_context.enter_context(pb)
            samples = pb(samples)

            if autosave:
                save_context = foc.SaveContext(
                    self,
                    batch_size=batch_size,
                    batching_strategy=batching_strategy,
                )
                exit_context.enter_context(save_context)

            for sample in samples:
                yield sample

                if autosave:
                    save_context.save(sample)

    def _iter_samples(self, pipeline=None):
        index = 0

        try:
            for d in self._aggregate(
                pipeline=pipeline,
                detach_frames=True,
                detach_groups=True,
            ):
                sample = self._make_sample(d)
                index += 1
                yield sample

        except CursorNotFound:
            # The cursor has timed out so we yield from a new one after
            # skipping to the last offset
            pipeline = [{"$skip": index}] + (pipeline or [])
            for sample in self._iter_samples(pipeline=pipeline):
                yield sample

    def iter_groups(
        self,
        group_slices=None,
        progress=False,
        autosave=False,
        batch_size=None,
        batching_strategy=None,
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

            # Save using default batching strategy
            for group in dataset.iter_groups(progress=True, autosave=True):
                for sample in group.values():
                    sample["test"] = make_label()

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
            progress (False): whether to render a progress bar (True/False),
                use the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            autosave (False): whether to automatically save changes to samples
                emitted by this iterator
            batch_size (None): the batch size to use when autosaving samples.
                If a ``batching_strategy`` is provided, this parameter
                configures the strategy as described below. If no
                ``batching_strategy`` is provided, this can either be an
                integer specifying the number of samples to save in a batch
                (in which case ``batching_strategy`` is implicitly set to
                ``"static"``) or a float number of seconds between batched
                saves (in which case ``batching_strategy`` is implicitly set to
                ``"latency"``)
            batching_strategy (None): the batching strategy to use for each
                save operation when autosaving samples. Supported values are:

                -   ``"static"``: a fixed sample batch size for each save
                -   ``"size"``: a target batch size, in bytes, for each save
                -   ``"latency"``: a target latency, in seconds, between saves

                By default, ``fo.config.default_batcher`` is used

        Returns:
            an iterator that emits dicts mapping group slice names to
            :class:`fiftyone.core.sample.Sample` instances, one per group
        """
        if self.media_type != fom.GROUP:
            raise ValueError("%s does not contain groups" % type(self))

        with contextlib.ExitStack() as exit_context:
            groups = self._iter_groups(group_slices=group_slices)

            pb = fou.ProgressBar(total=self, progress=progress)
            exit_context.enter_context(pb)
            groups = pb(groups)

            if autosave:
                save_context = foc.SaveContext(
                    self,
                    batch_size=batch_size,
                    batching_strategy=batching_strategy,
                )
                exit_context.enter_context(save_context)

            for group in groups:
                yield group

                if autosave:
                    for sample in group.values():
                        save_context.save(sample)

    def _iter_groups(self, group_slices=None, pipeline=None):
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
                sample = self._make_sample(d)

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

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart-groups")

            group_id = dataset.take(1).first().group.id
            group = dataset.get_group(group_id)

            print(group.keys())
            # ['left', 'right', 'pcd']

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
        sample = self._transform_sample(
            sample,
            expand_schema=expand_schema,
            dynamic=dynamic,
            validate=validate,
            copy=True,
        )

        _, ids = self._add_samples_batch([sample])
        return ids[0]

    def add_samples(
        self,
        samples,
        expand_schema=True,
        dynamic=False,
        validate=True,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed (if possible) via ``len(samples)``
                if needed for progress tracking

        Returns:
            a list of IDs of the samples in the dataset
        """
        if num_samples is None:
            num_samples = samples

        transform_fn = partial(
            self._transform_sample,
            expand_schema=expand_schema,
            dynamic=dynamic,
            validate=validate,
            copy=True,
        )

        batcher = fou.get_default_batcher(
            samples,
            transform_fn=transform_fn,
            size_calc_fn=self._calculate_size,
            progress=progress,
            total=num_samples,
        )

        def _do_add_samples():
            with batcher:
                for batch in batcher:
                    res, ids = self._add_samples_batch(batch)
                    if hasattr(res, "nBytes") and hasattr(
                        batcher, "set_encoding_ratio"
                    ):
                        batcher.set_encoding_ratio(res.nBytes)

                    yield ids

        if generator:
            return _do_add_samples()

        sample_ids = []
        for ids in _do_add_samples():
            sample_ids.extend(ids)

        return sample_ids

    def add_collection(
        self,
        sample_collection,
        include_info=True,
        overwrite_info=False,
        new_ids=False,
        progress=None,
    ):
        """Adds the contents of the given collection to the dataset.

        This method is a special case of :meth:`Dataset.merge_samples` that
        adds samples with new IDs to this dataset and omits any samples with
        existing IDs (the latter would only happen in rare cases).

        Use :meth:`Dataset.merge_samples` if you have multiple datasets whose
        samples refer to the same source media.

        Args:
            sample_collection: a :class:`fiftyone.core.collections.SampleCollection`
            include_info (True): whether to merge dataset-level information
                such as ``info`` and ``classes``
            overwrite_info (False): whether to overwrite existing dataset-level
                information. Only applicable when ``include_info`` is True
            new_ids (False): whether to generate new sample/frame/group IDs. By
                default, the IDs of the input collection are retained
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            progress=progress,
        )
        return self.skip(num_samples).values("id")

    def _add_samples_batch(self, samples_and_docs):
        """Writes the given samples and backing docs to the database and
        returns their IDs.

        Args:
            samples_and_docs: a list of tuples of the form ``(sample, dict)``,
                where the dict is the sample's backing document

        Returns:
            a tuple of

            -   ``pymongo.results.InsertManyResult``
            -   a list of IDs of the samples that were added to this dataset
        """
        dicts = [doc for _, doc in samples_and_docs]
        try:
            # adds `_id` to each dict
            res = self._sample_collection.insert_many(dicts)
        except BulkWriteError as bwe:
            msg = bwe.details["writeErrors"][0]["errmsg"]
            raise ValueError(msg) from bwe

        for sample, d in samples_and_docs:
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)
            if sample.media_type == fom.VIDEO:
                sample.frames.save()

        return (res, [str(d["_id"]) for d in dicts])

    def _upsert_samples(
        self,
        samples,
        expand_schema=True,
        dynamic=False,
        validate=True,
        generator=False,
        progress=None,
        num_samples=None,
    ):
        transform_fn = partial(
            self._transform_sample,
            expand_schema=expand_schema,
            dynamic=dynamic,
            validate=validate,
            copy=False,
            include_id=True,
        )

        batcher = fou.get_default_batcher(
            samples,
            transform_fn=transform_fn,
            size_calc_fn=self._calculate_size,
            progress=progress,
            total=num_samples,
        )

        def _do_upsert_samples():
            with batcher:
                for batch in batcher:
                    yield self._upsert_samples_batch(batch)

        if generator:
            return _do_upsert_samples()

        for _ in _do_upsert_samples():
            pass

    def _transform_sample(
        self,
        sample,
        expand_schema=True,
        dynamic=False,
        validate=True,
        copy=False,
        include_id=False,
    ):
        """Transforms the given sample and returns the transformed sample and
        dict as a pair.

        This method handles schema expansion, validation, and preparing the
        sample's backing document before adding it to the database.

        Args:
            sample: the sample to transform
            expand_schema (True): whether to dynamically add new sample fields
                encountered
            dynamic (False: whether to declare dynamic attributes of embedded
                document fields
            validate (True): whether to validate the sample against the dataset
                schema
            copy (False): whether to create a copy of the sample if it's
                already in a dataset
            include_id (False): whether to include the sample's ID in the
                backing document

        Returns:
            a tuple of

            -   ``transformed_sample``
            -   ``backing_document_dict``
        """
        if copy and sample._in_db:
            sample = sample.copy()

        if self.media_type is None and sample:
            self.media_type = _get_media_type(sample)

        if expand_schema:
            self._expand_schema(sample, dynamic)

        if validate:
            self._validate_sample(sample)

        now = datetime.utcnow()

        return (
            sample,
            self._make_dict(
                sample,
                include_id=include_id,
                created_at=now,
                last_modified_at=now,
            ),
        )

    def _calculate_size(self, sample):
        try:
            return len(json_util.dumps(sample[1]))
        except Exception:
            return len(str(sample[1]))

    def _upsert_samples_batch(self, samples_and_docs):
        """Upserts the given samples and their backing docs to the database.

        Args:
            samples_and_docs: a list of tuples of the form ``(sample, dict)``,
                where the dict is the sample's backing document
        """
        ops = []
        for sample, d in samples_and_docs:
            if sample.id:
                ops.append(ReplaceOne({"_id": sample._id}, d, upsert=True))
            else:
                d.pop("_id", None)
                ops.append(InsertOne(d))  # adds `_id` to dict

        try:
            self._sample_collection.bulk_write(ops, ordered=False)
        except BulkWriteError as bwe:
            msg = bwe.details["writeErrors"][0]["errmsg"]
            raise ValueError(msg) from bwe

        for sample, d in samples_and_docs:
            doc = self._sample_dict_to_doc(d)
            sample._set_backing_doc(doc, dataset=self)

            if sample.media_type == fom.VIDEO:
                sample.frames.save()

    def _make_dict(
        self,
        sample,
        include_id=False,
        created_at=None,
        last_modified_at=None,
    ):
        d = sample.to_mongo_dict(include_id=include_id)

        # We omit None here to allow samples with None-valued new fields to
        # be added without raising nonexistent field errors. This is safe
        # because None and missing are equivalent in our data model
        d = {k: v for k, v in d.items() if v is not None}

        d["_dataset_id"] = self._doc.id

        if created_at is not None and not sample._in_db:
            d["created_at"] = created_at

        if last_modified_at is not None:
            d["last_modified_at"] = last_modified_at

        return d

    def _bulk_write(
        self, ops, ids=None, frames=False, ordered=False, progress=False
    ):
        if frames:
            coll = self._frame_collection
        else:
            coll = self._sample_collection

        foo.bulk_write(ops, coll, ordered=ordered, progress=progress)

        if frames:
            fofr.Frame._reload_docs(self._frame_collection_name, frame_ids=ids)
        else:
            fos.Sample._reload_docs(
                self._sample_collection_name, sample_ids=ids
            )

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

    def merge_sample(
        self,
        sample,
        key_field="filepath",
        skip_existing=False,
        insert_new=True,
        fields=None,
        omit_fields=None,
        merge_lists=True,
        merge_embedded_docs=False,
        overwrite=True,
        expand_schema=True,
        validate=True,
        dynamic=False,
    ):
        """Merges the fields of the given sample into this dataset.

        By default, the sample is merged with an existing sample with the same
        absolute ``filepath``, if one exists. Otherwise a new sample is
        inserted. You can customize this behavior via the ``key_field``,
        ``skip_existing``, and ``insert_new`` parameters.

        The behavior of this method is highly customizable. By default, all
        top-level fields from the provided sample are merged in, overwriting
        any existing values for those fields, with the exception of list fields
        (e.g., ``tags``) and label list fields (e.g.,
        :class:`fiftyone.core.labels.Detections` fields), in which case the
        elements of the lists themselves are merged. In the case of label list
        fields, labels with the same ``id`` in both samples are updated rather
        than duplicated.

        To avoid confusion between missing fields and fields whose value is
        ``None``, ``None``-valued fields are always treated as missing while
        merging.

        This method can be configured in numerous ways, including:

        -   Whether new fields can be added to the dataset schema
        -   Whether list fields should be treated as ordinary fields and merged
            as a whole rather than merging their elements
        -   Whether to merge only specific fields, or all but certain fields
        -   Mapping input sample fields to different field names of this sample

        Args:
            sample: a :class:`fiftyone.core.sample.Sample`
            key_field ("filepath"): the sample field to use to decide whether
                to join with an existing sample
            skip_existing (False): whether to skip existing samples (True) or
                merge them (False)
            insert_new (True): whether to insert new samples (True) or skip
                them (False)
            fields (None): an optional field or iterable of fields to which to
                restrict the merge. May contain frame fields for video samples.
                This can also be a dict mapping field names of the input sample
                to field names of this dataset
            omit_fields (None): an optional field or iterable of fields to
                exclude from the merge. May contain frame fields for video
                samples
            merge_lists (True): whether to merge the elements of list fields
                (e.g., ``tags``) and label list fields (e.g.,
                :class:`fiftyone.core.labels.Detections` fields) rather than
                merging the entire top-level field like other field types.
                For label lists fields, existing
                :class:`fiftyone.core.label.Label` elements are either replaced
                (when ``overwrite`` is True) or kept (when ``overwrite`` is
                False) when their ``id`` matches a label from the provided
                sample
            merge_embedded_docs (False): whether to merge the attributes of
                embedded documents (True) rather than merging the entire
                top-level field (False)
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if any fields are not in the dataset schema
            validate (True): whether to validate values for existing fields
            dynamic (False): whether to declare dynamic embedded document
                fields
        """
        try:
            if self.media_type == fom.GROUP:
                view = self.select_group_slices(_allow_mixed=True)
            else:
                view = self

            existing_sample = view.one(F(key_field) == sample[key_field])
        except ValueError:
            if insert_new:
                self.add_sample(
                    sample,
                    expand_schema=expand_schema,
                    dynamic=dynamic,
                    validate=validate,
                )

            return

        if not skip_existing:
            existing_sample.merge(
                sample,
                fields=fields,
                omit_fields=omit_fields,
                merge_lists=merge_lists,
                merge_embedded_docs=merge_embedded_docs,
                overwrite=overwrite,
                expand_schema=expand_schema,
                validate=validate,
                dynamic=dynamic,
            )
            existing_sample.save()

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
        merge_embedded_docs=False,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        include_info=True,
        overwrite_info=False,
        progress=None,
        num_samples=None,
    ):
        """Merges the given samples into this dataset.

        .. note::

            This method requires the ability to create *unique* indexes on the
            ``key_field`` of each collection.

            See :meth:`add_collection` if you want to add samples from one
            collection to another dataset without a uniqueness constraint.

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
            merge_embedded_docs (False): whether to merge the attributes of
                embedded documents (True) rather than merging the entire
                top-level field (False)
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            num_samples (None): the number of samples in ``samples``. If not
                provided, this is computed (if possible) via ``len(samples)``
                if needed for progress tracking
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
                merge_embedded_docs=merge_embedded_docs,
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
                    samples,
                    dynamic=dynamic,
                    progress=progress,
                    num_samples=num_samples,
                )

                self.merge_samples(
                    tmp,
                    key_field=key_field,
                    skip_existing=skip_existing,
                    insert_new=insert_new,
                    fields=fields,
                    omit_fields=omit_fields,
                    merge_lists=merge_lists,
                    merge_embedded_docs=merge_embedded_docs,
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
            merge_embedded_docs=merge_embedded_docs,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            progress=progress,
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
        self,
        labels=None,
        ids=None,
        instance_ids=None,
        tags=None,
        view=None,
        fields=None,
    ):
        """Deletes the specified labels from the dataset.

        You can specify the labels to delete via any of the following methods:

        -   Provide the ``labels`` argument, which should contain a list of
            dicts in the format returned by
            :attr:`fiftyone.core.session.Session.selected_labels`

        -   Provide the ``ids`` argument to specify the labels to delete via
            their IDs

        -   Provide the ``instance_ids`` argument to specify the labels to
            delete via their instance IDs

        -   Provide the ``tags`` argument to specify the labels to delete via
            their tags

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
                :attr:`fiftyone.core.session.Session.selected_labels`
            ids (None): an ID or iterable of IDs of the labels to delete
            instance_ids (None): an instance ID or iterable of instance IDs of
                the labels to delete
            tags (None): a tag or iterable of tags of the labels to delete
            view (None): a :class:`fiftyone.core.view.DatasetView` into this
                dataset containing the labels to delete
            fields (None): a field or iterable of fields from which to delete
                labels
        """
        if labels is not None:
            self._delete_labels(labels, fields=fields)

        if view is not None:
            labels = view._get_selected_labels(fields=fields)
            self._delete_labels(labels, fields=fields)

        if ids is None and instance_ids is None and tags is None:
            return

        if etau.is_str(ids):
            ids = [ids]

        if ids is not None:
            ids = [ObjectId(_id) for _id in ids]

        if etau.is_str(instance_ids):
            instance_ids = [instance_ids]

        if instance_ids is not None:
            instance_ids = [ObjectId(_id) for _id in instance_ids]

        if etau.is_str(tags):
            tags = [tags]

        if fields is None:
            fields = self._get_label_fields()
        elif etau.is_str(fields):
            fields = [fields]

        for field in fields:
            if self._is_read_only_field(field):
                raise ValueError("Cannot edit read-only field '%s'" % field)

        now = datetime.utcnow()

        batch_size = fou.recommend_batch_size_for_value(
            ObjectId(), max_size=100000
        )

        sample_ops = []
        frame_ops = []
        for field in fields:
            root, is_list_field = self._get_label_field_root(field)
            root, is_frame_field = self._handle_frame_field(root)

            ops = []
            if is_list_field:
                if ids is not None:
                    for _ids in fou.iter_batches(ids, batch_size):
                        ops.append(
                            UpdateMany(
                                {root + "._id": {"$in": _ids}},
                                {
                                    "$pull": {root: {"_id": {"$in": _ids}}},
                                    "$set": {"last_modified_at": now},
                                },
                            )
                        )

                if instance_ids is not None:
                    for _ids in fou.iter_batches(instance_ids, batch_size):
                        ops.append(
                            UpdateMany(
                                {root + ".instance._id": {"$in": _ids}},
                                {
                                    "$pull": {
                                        root: {"instance._id": {"$in": _ids}}
                                    },
                                    "$set": {"last_modified_at": now},
                                },
                            )
                        )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {root + ".tags": {"$elemMatch": {"$in": tags}}},
                            {
                                "$pull": {
                                    root: {
                                        "tags": {"$elemMatch": {"$in": tags}}
                                    }
                                },
                                "$set": {"last_modified_at": now},
                            },
                        )
                    )
            else:
                if ids is not None:
                    for _ids in fou.iter_batches(ids, batch_size):
                        ops.append(
                            UpdateMany(
                                {root + "._id": {"$in": _ids}},
                                {
                                    "$set": {
                                        root: None,
                                        "last_modified_at": now,
                                    }
                                },
                            )
                        )

                if instance_ids is not None:
                    for _ids in fou.iter_batches(instance_ids, batch_size):
                        ops.append(
                            UpdateMany(
                                {root + ".instance._id": {"$in": _ids}},
                                {
                                    "$set": {
                                        root: None,
                                        "last_modified_at": now,
                                    }
                                },
                            )
                        )

                if tags is not None:
                    ops.append(
                        UpdateMany(
                            {root + ".tags": {"$elemMatch": {"$in": tags}}},
                            {"$set": {root: None, "last_modified_at": now}},
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

        if fields is not None:
            labels_map = {f: l for f, l in labels_map.items() if f in fields}

        for field in labels_map.keys():
            if self._is_read_only_field(field):
                raise ValueError("Cannot edit read-only field '%s'" % field)

        now = datetime.utcnow()

        sample_ops = []
        frame_ops = []
        for field, field_labels in labels_map.items():
            root, is_list_field = self._get_label_field_root(field)
            root, is_frame_field = self._handle_frame_field(root)

            if is_frame_field:
                # Partition by (sample ID, frame number)
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[(l["sample_id"], l["frame_number"])].append(
                        ObjectId(l["label_id"])
                    )

                if is_list_field:
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
                                        root: {"_id": {"$in": label_ids}}
                                    },
                                    "$set": {"last_modified_at": now},
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
                                        root + "._id": label_id,
                                    },
                                    {
                                        "$set": {
                                            root: None,
                                            "last_modified_at": now,
                                        }
                                    },
                                )
                            )
            else:
                # Partition by sample ID
                _labels_map = defaultdict(list)
                for l in field_labels:
                    _labels_map[l["sample_id"]].append(ObjectId(l["label_id"]))

                if is_list_field:
                    for sample_id, label_ids in _labels_map.items():
                        sample_ops.append(
                            UpdateOne(
                                {"_id": ObjectId(sample_id)},
                                {
                                    "$pull": {
                                        root: {"_id": {"$in": label_ids}}
                                    },
                                    "$set": {"last_modified_at": now},
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
                                        root + "._id": label_id,
                                    },
                                    {
                                        "$set": {
                                            root: None,
                                            "last_modified_at": now,
                                        }
                                    },
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

    def save(self):
        """Saves the dataset to the database.

        This only needs to be called when dataset-level information such as its
        :meth:`Dataset.info` is modified.
        """
        self._save()

    def _save(self, view=None, fields=None):
        if view is not None:
            _save_view(view, fields=fields)

        try:
            self._doc.save(safe=True)
        except moe.DoesNotExist:
            name = self.name
            self._deleted = True
            raise ValueError("Dataset '%s' is deleted" % name)

    def _save_field(self, field, _enforce_read_only=True):
        if self._is_generated:
            raise ValueError(
                "Cannot save fields on generated views. Use the dataset's "
                "fields instead"
            )

        is_default = self._is_default_field(field.path)
        path, is_frame_field = self._handle_frame_field(field.path)

        if is_frame_field:
            doc_cls = self._frame_doc_cls
        else:
            doc_cls = self._sample_doc_cls

        field_doc = doc_cls._get_field_doc(path, reload=True)

        if is_default and _enforce_read_only:
            default_field = self._get_default_field(field.path)
            if default_field.read_only and not field.read_only:
                raise ValueError(
                    "Read-only default field '%s' must remain read-only"
                    % field.path
                )

        if "." in path and _enforce_read_only:
            root = path.rsplit(".", 1)[0]
            root_doc = doc_cls._get_field_doc(root)
            if root_doc.read_only:
                raise ValueError(
                    "Cannot edit read-only field '%s'" % field.path
                )

        if field.read_only and field_doc.read_only and _enforce_read_only:
            raise ValueError("Cannot edit read-only field '%s'" % field.path)

        if field.read_only != field_doc.read_only:
            _set_field_read_only(field_doc, field.read_only)
            _reload = True
        else:
            _reload = False

        field_doc.description = field.description
        field_doc.info = field.info

        try:
            self.save()
        except:
            self.reload()
            raise

        if _reload:
            self.reload()

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

    def list_saved_views(self, info=False):
        """List saved views on this dataset.

        Args:
            info (False): whether to return info dicts describing each saved view
                rather than just their names

        Returns:
            a list of saved view names or info dicts
        """

        if info:
            return [
                {f: getattr(view_doc, f) for f in view_doc._EDITABLE_FIELDS}
                for view_doc in self._doc.get_saved_views()
            ]

        return [view_doc.name for view_doc in self._doc.get_saved_views()]

    def save_view(
        self,
        name,
        view,
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
            description (None): an optional string description
            color (None): an optional RGB hex string like ``'#FF6D04'``
            overwrite (False): whether to overwrite an existing saved view with
                the same name
        """
        if view._root_dataset._doc.id != self._doc.id:
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
        view_doc.save(upsert=True)

        # Targeted reload of saved views for better concurrency safety.
        # @todo improve list field updates in general so this isn't necessary
        self._doc.reload("saved_views")

        self._doc.saved_views.append(view_doc)
        self._doc.last_modified_at = now
        self._doc.save(virtual=True)

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
            view_doc.save()

    def load_saved_view(self, name):
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
        view_doc._update_last_loaded_at()
        return view

    def delete_saved_view(self, name):
        """Deletes the saved view with the given name.

        Args:
            name: the name of a saved view
        """
        self._delete_saved_view(name)

    def delete_saved_views(self):
        """Deletes all saved views from this dataset."""

        # Targeted reload of saved views for better concurrency safety.
        # @todo improve list field updates in general so this isn't necessary
        self._doc.reload("saved_views")

        for view_doc in self._doc.saved_views:
            if isinstance(view_doc, DBRef):
                continue

            view_doc.delete()

        self._doc.saved_views = []
        self.save()

    def _delete_saved_view(self, name):
        view_doc = self._get_saved_view_doc(name, pop=True)
        if not isinstance(view_doc, DBRef):
            view_id = str(view_doc.id)
            view_doc.delete()
        else:
            view_id = None

        self.save()

        return view_id

    def _get_saved_view_doc(self, name, pop=False, slug=False):
        idx = None
        key = "slug" if slug else "name"

        if pop:
            # Targeted reload of saved views for better concurrency safety.
            # @todo improve list field updates in general so this
            #   isn't necessary
            self._doc.reload("saved_views")

        for i, view_doc in enumerate(self._doc.get_saved_views()):
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
        for view_doc in self._doc.get_saved_views():
            if view_doc is skip:
                continue

            if name == view_doc.name or slug == view_doc.slug:
                clashing_name = view_doc.name

                if not overwrite:
                    if clashing_name == name:
                        raise ValueError(f"Saved view '{name}' already exists")
                    else:
                        raise ValueError(
                            f"Saved view name '{name}' is not available: slug "
                            f"'{slug}' in use by saved view '{clashing_name}'"
                        )

                self.delete_saved_view(clashing_name)

        return slug

    @property
    def has_workspaces(self):
        """Whether this dataset has any saved workspaces."""
        return bool(self.list_workspaces())

    def has_workspace(self, name):
        """Whether this dataset has a saved workspace with the given name.

        Args:
            name: a saved workspace name

        Returns:
            True/False
        """
        return name in self.list_workspaces()

    def list_workspaces(self, info=False):
        """List saved workspaces on this dataset.

        Args:
            info (False): whether to return info dicts describing each saved workspace
                rather than just their names

        Returns:
            a list of saved workspace names or info dicts
        """

        if info:
            return [
                {
                    f: getattr(workspace_doc, f)
                    for f in workspace_doc._EDITABLE_FIELDS
                }
                for workspace_doc in self._doc.get_workspaces()
            ]

        return [
            workspace_doc.name for workspace_doc in self._doc.get_workspaces()
        ]

    def save_workspace(
        self,
        name,
        workspace,
        description=None,
        color=None,
        overwrite=False,
    ):
        """Saves a workspace into this dataset under the given name so it
        can be loaded later via :meth:`load_workspace`.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            embeddings_panel = fo.Panel(
                type="Embeddings",
                state=dict(
                    brainResult="img_viz",
                    colorByField="metadata.size_bytes"
                ),
            )
            workspace = fo.Space(children=[embeddings_panel])

            workspace_name = "embeddings-workspace"
            description = "Show embeddings only"
            dataset.save_workspace(
                workspace_name,
                workspace,
                description=description
            )
            assert dataset.has_workspace(workspace_name)

            also_workspace = dataset.load_workspace(workspace_name)
            assert workspace == also_workspace

        Args:
            name: a name for the saved workspace
            workspace: a :class:`fiftyone.core.odm.workspace.Space`
            description (None): an optional string description
            color (None): an optional RGB hex string like ``'#FF6D04'``
            overwrite (False): whether to overwrite an existing workspace with
                the same name

        Raises:
            ValueError: if ``overwrite==False`` and workspace with ``name``
                already exists
        """
        slug = self._validate_workspace_name(name, overwrite=overwrite)

        now = datetime.utcnow()

        workspace_doc = foo.WorkspaceDocument(
            child=workspace,
            color=color,
            created_at=now,
            dataset_id=self._doc.id,
            description=description,
            last_modified_at=now,
            name=name,
            slug=slug,
        )

        workspace_doc.save(upsert=True)

        # Targeted reload of workspaces for better concurrency safety.
        # @todo improve list field updates in general so this isn't necessary
        self._doc.reload("workspaces")

        self._doc.workspaces.append(workspace_doc)
        self._doc.last_modified_at = now
        self._doc.save(virtual=True)

    def load_workspace(self, name):
        """Loads the saved workspace with the given name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            embeddings_panel = fo.Panel(
                type="Embeddings",
                state=dict(brainResult="img_viz", colorByField="metadata.size_bytes"),
            )
            workspace = fo.Space(children=[embeddings_panel])
            workspace_name = "embeddings-workspace"
            dataset.save_workspace(workspace_name, workspace)

            # Some time later ... load the workspace
            loaded_workspace = dataset.load_workspace(workspace_name)
            assert workspace == loaded_workspace

            # Launch app with the loaded workspace!
            session = fo.launch_app(dataset, spaces=loaded_workspace)

            # Or set via session later on
            session.spaces = loaded_workspace

        Args:
            name: the name of a saved workspace

        Returns:
            a :class:`fiftyone.core.odm.workspace.Space`

        Raises:
            ValueError: if ``name`` is not a saved workspace
        """
        workspace_doc = self._get_workspace_doc(name)
        workspace = workspace_doc.child
        workspace_doc._update_last_loaded_at()
        return workspace

    def get_workspace_info(self, name):
        """Gets the information about the workspace with the given name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            workspace = fo.Space()
            description = "A really cool (apparently empty?) workspace"
            dataset.save_workspace("test", workspace, description=description)

            print(dataset.get_workspace_info("test"))

        Args:
            name: the name of a saved view

        Returns:
            a dict of editable info
        """
        workspace_doc = self._get_workspace_doc(name)
        return {
            f: getattr(workspace_doc, f)
            for f in workspace_doc._EDITABLE_FIELDS
        }

    def update_workspace_info(self, name, info):
        """Updates the editable information for the saved view with the given
        name.

        Examples::

            import fiftyone as fo
            import fiftyone.zoo as foz

            dataset = foz.load_zoo_dataset("quickstart")

            workspace = fo.Space()
            dataset.save_workspace("test", view)

            # Update the workspace's name and add a description, color
            info = dict(
                name="a new name",
                color="#FF6D04",
                description="a description",
            )
            dataset.update_workspace_info("test", info)

        Args:
            name: the name of a saved workspace
            info: a dict whose keys are a subset of the keys returned by
                :meth:`get_workspace_info`
        """
        workspace_doc = self._get_workspace_doc(name)

        invalid_fields = set(info.keys()) - set(workspace_doc._EDITABLE_FIELDS)
        if invalid_fields:
            raise ValueError("Cannot edit fields %s" % invalid_fields)

        edited = False
        for key, value in info.items():
            if value != getattr(workspace_doc, key):
                if key == "name":
                    slug = self._validate_workspace_name(
                        value, skip=workspace_doc
                    )
                    workspace_doc.slug = slug

                setattr(workspace_doc, key, value)
                edited = True

        if edited:
            workspace_doc.save()

    def delete_workspace(self, name):
        """Deletes the saved workspace with the given name.

        Args:
            name: the name of a saved workspace

        Raises:
            ValueError: if ``name`` is not a saved workspace
        """
        self._delete_workspace(name)

    def delete_workspaces(self):
        """Deletes all saved workspaces from this dataset."""

        # Targeted reload of workspaces for better concurrency safety.
        # @todo improve list field updates in general so this isn't necessary
        self._doc.reload("workspaces")

        for workspace_doc in self._doc.workspaces:
            if isinstance(workspace_doc, DBRef):
                continue

            # Detach child from workspace
            if workspace_doc.child is not None:
                workspace_doc.child._name = None
            workspace_doc.delete()

        self._doc.workspaces = []
        self.save()

    def _delete_workspace(self, name):
        workspace_doc = self._get_workspace_doc(name, pop=True)
        if not isinstance(workspace_doc, DBRef):
            workspace_id = str(workspace_doc.id)

            # Detach child from workspace
            if workspace_doc.child is not None:
                workspace_doc.child._name = None
            workspace_doc.delete()
        else:
            workspace_id = None

        self.save()

        return workspace_id

    def _get_workspace_doc(self, name, pop=False, slug=False):
        idx = None
        key = "slug" if slug else "name"

        if pop:
            # Targeted reload of workspaces for better concurrency safety.
            # @todo improve list field updates in general so this
            #   isn't necessary
            self._doc.reload("workspaces")

        for i, workspace_doc in enumerate(self._doc.get_workspaces()):
            if name == getattr(workspace_doc, key):
                idx = i
                break

        if idx is None:
            raise ValueError("Dataset has no saved workspace '%s'" % name)

        if pop:
            return self._doc.workspaces.pop(idx)

        return self._doc.workspaces[idx]

    def _validate_workspace_name(self, name, skip=None, overwrite=False):
        slug = fou.to_slug(name)
        for workspace_doc in self._doc.get_workspaces():
            if workspace_doc is skip:
                continue

            if name == workspace_doc.name or slug == workspace_doc.slug:
                clashing_name = workspace_doc.name

                if not overwrite:
                    if clashing_name == name:
                        raise ValueError(f"Workspace '{name}' already exists")
                    else:
                        raise ValueError(
                            f"Workspace name '{name}' is not available: slug "
                            f"'{slug}' in use by workspace '{clashing_name}'"
                        )

                self.delete_workspace(clashing_name)

        return slug

    def clone(self, name=None, persistent=False, include_indexes=True):
        """Creates a copy of the dataset.

        Dataset clones contain deep copies of all samples and dataset-level
        information in the source dataset. The source *media files*, however,
        are not copied.

        Args:
            name (None): a name for the cloned dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the cloned dataset should be persistent
            include_indexes (True): whether to recreate any custom indexes on
                the new dataset (True) or a list of specific indexes or
                index prefixes to recreate. By default, all custom indexes are
                recreated

        Returns:
            the new :class:`Dataset`
        """
        return self._clone(
            name=name,
            persistent=persistent,
            include_indexes=include_indexes,
        )

    def _clone(
        self,
        name=None,
        persistent=False,
        view=None,
        include_indexes=True,
    ):
        if name is None:
            name = get_default_dataset_name()

        if view is not None:
            sample_collection = view
        else:
            sample_collection = self

        return _clone_collection(
            sample_collection,
            name,
            persistent=persistent,
            include_indexes=include_indexes,
        )

    def clear(self):
        """Removes all samples from the dataset.

        If reference to a sample exists in memory, the sample will be updated
        such that ``sample.in_dataset`` is False.
        """
        self._clear()

    def _clear(self, view=None, sample_ids=None):
        now = datetime.utcnow()

        if view is not None:
            contains_videos = view._contains_videos(any_slice=True)

            if view.media_type == fom.GROUP:
                view = view.select_group_slices(_allow_mixed=True)

            sample_ids = view.values("id")
        else:
            contains_videos = self._contains_videos(any_slice=True)

        ops = []
        if sample_ids is not None:
            batch_size = fou.recommend_batch_size_for_value(
                ObjectId(), max_size=100000
            )

            for _ids in fou.iter_batches(sample_ids, batch_size):
                _oids = [ObjectId(_id) for _id in _ids]
                ops.append(DeleteMany({"_id": {"$in": _oids}}))
        else:
            ops.append(DeleteMany({}))

        foo.bulk_write(ops, self._sample_collection)
        self._update_last_deletion_at(now)

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

        now = datetime.utcnow()

        if self._is_clips:
            if sample_ids is not None:
                view = self.select(sample_ids)
            elif frame_ids is None and view is None:
                view = self

            if view is not None:
                frame_ids = view.values("frames.id", unwind=True)

        if frame_ids is not None:
            sample_ids = []
            sample_ops = []
            frame_ops = []

            batch_size = fou.recommend_batch_size_for_value(
                ObjectId(), max_size=100000
            )

            for _ids in fou.iter_batches(frame_ids, batch_size):
                _frame_ids = [ObjectId(_id) for _id in _ids]
                _sample_ids = list(
                    self._frame_collection.find(
                        {"_id": {"$in": _frame_ids}}
                    ).distinct("_sample_id")
                )

                sample_ids.extend(_sample_ids)
                sample_ops.append(
                    UpdateMany(
                        {"_id": {"$in": _sample_ids}},
                        {"$set": {"last_modified_at": now}},
                    )
                )
                frame_ops.append(DeleteMany({"_id": {"$in": _frame_ids}}))

            foo.bulk_write(frame_ops, self._frame_collection)
            foo.bulk_write(sample_ops, self._sample_collection)

            fos.Sample._reload_docs(
                self._sample_collection_name, sample_ids=sample_ids
            )
            fofr.Frame._reset_docs_by_frame_id(
                self._frame_collection_name, frame_ids
            )

            return

        if view is not None:
            if view.media_type == fom.GROUP:
                view = view.select_group_slices(media_type=fom.VIDEO)

            sample_ids = view.values("id")

        sample_ops = []
        frame_ops = []
        if sample_ids is not None:
            batch_size = fou.recommend_batch_size_for_value(
                ObjectId(), max_size=100000
            )

            for _ids in fou.iter_batches(sample_ids, batch_size):
                _oids = [ObjectId(_id) for _id in _ids]
                sample_ops.append(
                    UpdateMany(
                        {"_id": {"$in": _oids}},
                        {"$set": {"last_modified_at": now}},
                    )
                )
                frame_ops.append(DeleteMany({"_sample_id": {"$in": _oids}}))
        else:
            sample_ops.append(
                UpdateMany({}, {"$set": {"last_modified_at": now}})
            )
            frame_ops.append(DeleteMany({}))

        foo.bulk_write(frame_ops, self._frame_collection)
        foo.bulk_write(sample_ops, self._sample_collection)

        fos.Sample._reload_docs(
            self._sample_collection_name, sample_ids=sample_ids
        )
        fofr.Frame._reset_docs(
            self._frame_collection_name, sample_ids=sample_ids
        )

    def _keep_frames(self, view=None, frame_ids=None):
        sample_collection = view if view is not None else self
        if not sample_collection._contains_videos(any_slice=True):
            return

        if self._is_clips and view is None:
            view = self

        if view is None:
            return

        now = datetime.utcnow()

        if view.media_type == fom.GROUP:
            view = view.select_group_slices(media_type=fom.VIDEO)

        if view._is_clips:
            sample_ids, frame_numbers = view.values(
                ["sample_id", "frames.frame_number"]
            )

            # Handle multiple clips per sample
            d = defaultdict(set)
            for sample_id, fns in zip(sample_ids, frame_numbers):
                d[sample_id].update(fns)

            sample_ids, frame_numbers = zip(
                *((sample_id, list(fns)) for sample_id, fns in d.items())
            )
        else:
            sample_ids, frame_numbers = view.values(
                ["id", "frames.frame_number"]
            )

        sample_ops = []
        frame_ops = []
        for sample_id, fns in zip(sample_ids, frame_numbers):
            # Note: this may fail if `fns` is too large (eg >100k frames), but
            # to address this we'd need to do something like lookup all frame
            # numbers on the dataset and reverse the $not in-memory, which
            # would be quite expensive...
            frame_ops.append(
                DeleteMany(
                    {
                        "_sample_id": ObjectId(sample_id),
                        "frame_number": {"$not": {"$in": fns}},
                    }
                )
            )

        if not frame_ops:
            return

        sample_ops.append(
            UpdateMany(
                {"_id": {"$in": [ObjectId(_id) for _id in set(sample_ids)]}},
                {"$set": {"last_modified_at": now}},
            )
        )

        foo.bulk_write(frame_ops, self._frame_collection)
        foo.bulk_write(sample_ops, self._sample_collection)

        fos.Sample._reload_docs(
            self._sample_collection_name, sample_ids=sample_ids
        )
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

        now = datetime.utcnow()

        sample_collection.compute_metadata()
        sample_collection._aggregate(
            post_pipeline=[
                {
                    "$project": {
                        "_id": False,
                        "_sample_id": "$_id",
                        "_dataset_id": self._doc.id,
                        "created_at": now,
                        "last_modified_at": now,
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
        self._delete()

    def _delete(self):
        self._sample_collection.drop()
        fos.Sample._reset_docs(self._sample_collection_name)

        # Clips datasets directly inherit frames from source dataset
        if self._frame_collection_name is not None and not self._is_clips:
            self._frame_collection.drop()
            fofr.Frame._reset_docs(self._frame_collection_name)

        svc = foos.ExecutionStoreService(dataset_id=self._doc.id)
        svc.cleanup()

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
        generator=False,
        progress=None,
        **kwargs,
    ):
        """Adds the contents of the given directory to the dataset.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-common-datasets>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
                    case, the ``dataset_dir`` has no effect on the location of
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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
            generator=generator,
            progress=progress,
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
        merge_embedded_docs=False,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        progress=None,
        **kwargs,
    ):
        """Merges the contents of the given directory into the dataset.

        .. note::

            This method requires the ability to create *unique* indexes on the
            ``key_field`` of each collection.

            See :meth:`add_dir` if you want to add samples without a uniqueness
            constraint.

        You can perform imports with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-common-datasets>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized import.
            This syntax provides the flexibility to, for example, perform
            labels-only imports or imports where the source media lies in a
            different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
                    case, the ``dataset_dir`` has no effect on the location of
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
            merge_embedded_docs (False): whether to merge the attributes of
                embedded documents (True) rather than merging the entire
                top-level field (False)
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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
            merge_embedded_docs=merge_embedded_docs,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
            progress=progress,
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
        generator=False,
        progress=None,
        **kwargs,
    ):
        """Adds the contents of the given archive to the dataset.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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
            generator=generator,
            progress=progress,
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
        merge_embedded_docs=False,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        cleanup=True,
        progress=None,
        **kwargs,
    ):
        """Merges the contents of the given archive into the dataset.

        .. note::

            This method requires the ability to create *unique* indexes on the
            ``key_field`` of each collection.

            See :meth:`add_archive` if you want to add samples without a
            uniqueness constraint.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
            merge_embedded_docs (False): whether to merge the attributes of
                embedded documents (True) rather than merging the entire
                top-level field (False)
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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
            merge_embedded_docs=merge_embedded_docs,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
            progress=progress,
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
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            generator=generator,
            progress=progress,
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
        merge_embedded_docs=False,
        overwrite=True,
        expand_schema=True,
        dynamic=False,
        add_info=True,
        progress=None,
    ):
        """Merges the samples from the given
        :class:`fiftyone.utils.data.importers.DatasetImporter` into the
        dataset.

        .. note::

            This method requires the ability to create *unique* indexes on the
            ``key_field`` of each collection.

            See :meth:`add_importer` if you want to add samples without a
            uniqueness constraint.

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
            merge_embedded_docs (False): whether to merge the attributes of
                embedded documents (True) rather than merging the entire
                top-level field (False)
            overwrite (True): whether to overwrite (True) or skip (False)
                existing fields and label elements
            expand_schema (True): whether to dynamically add new fields
                encountered to the dataset schema. If False, an error is raised
                if a sample's schema is not a subset of the dataset schema
            dynamic (False): whether to declare dynamic attributes of embedded
                document fields that are encountered
            add_info (True): whether to add dataset info from the importer
                (if any) to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
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
            merge_embedded_docs=merge_embedded_docs,
            overwrite=overwrite,
            expand_schema=expand_schema,
            dynamic=dynamic,
            add_info=add_info,
            progress=progress,
        )

    def add_images(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        generator=False,
        progress=None,
    ):
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.ImageSampleParser()

        return foud.add_images(
            self,
            paths_or_samples,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def add_labeled_images(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            generator=generator,
            progress=progress,
        )

    def add_images_dir(
        self,
        images_dir,
        tags=None,
        recursive=True,
        generator=False,
        progress=None,
    ):
        """Adds the given directory of images to the dataset.

        See :class:`fiftyone.types.ImageDirectory` for format details. In
        particular, note that files with non-image MIME types are omitted.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = foud.parse_images_dir(images_dir, recursive=recursive)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(
            image_paths,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def add_images_patt(
        self,
        images_patt,
        tags=None,
        generator=False,
        progress=None,
    ):
        """Adds the given glob pattern of images to the dataset.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples in the dataset
        """
        image_paths = etau.get_glob_matches(images_patt)
        sample_parser = foud.ImageSampleParser()
        return self.add_images(
            image_paths,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def ingest_images(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        dataset_dir=None,
        image_format=None,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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

        return self.add_importer(
            dataset_ingestor,
            tags=tags,
            generator=generator,
            progress=progress,
        )

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
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            generator=generator,
            progress=progress,
        )

    def add_videos(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        generator=False,
        progress=None,
    ):
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        if sample_parser is None:
            sample_parser = foud.VideoSampleParser()

        return foud.add_videos(
            self,
            paths_or_samples,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def add_labeled_videos(
        self,
        samples,
        sample_parser,
        label_field=None,
        tags=None,
        expand_schema=True,
        dynamic=False,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            generator=generator,
            progress=progress,
        )

    def add_videos_dir(
        self,
        videos_dir,
        tags=None,
        recursive=True,
        generator=False,
        progress=None,
    ):
        """Adds the given directory of videos to the dataset.

        See :class:`fiftyone.types.VideoDirectory` for format details. In
        particular, note that files with non-video MIME types are omitted.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = foud.parse_videos_dir(videos_dir, recursive=recursive)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(
            video_paths,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def add_videos_patt(
        self,
        videos_patt,
        tags=None,
        generator=False,
        progress=None,
    ):
        """Adds the given glob pattern of videos to the dataset.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a list of IDs of the samples in the dataset
        """
        video_paths = etau.get_glob_matches(videos_patt)
        sample_parser = foud.VideoSampleParser()
        return self.add_videos(
            video_paths,
            sample_parser,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def ingest_videos(
        self,
        paths_or_samples,
        sample_parser=None,
        tags=None,
        dataset_dir=None,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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

        return self.add_importer(
            dataset_ingestor,
            tags=tags,
            generator=generator,
            progress=progress,
        )

    def ingest_labeled_videos(
        self,
        samples,
        sample_parser,
        tags=None,
        expand_schema=True,
        dynamic=False,
        dataset_dir=None,
        generator=False,
        progress=None,
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
            generator (False): whether to yield ID batches as a generator as
                samples are added to the dataset
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

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
            generator=generator,
            progress=progress,
        )

    @classmethod
    def from_dir(
        cls,
        dataset_dir=None,
        dataset_type=None,
        data_path=None,
        labels_path=None,
        name=None,
        persistent=False,
        overwrite=False,
        label_field=None,
        tags=None,
        dynamic=False,
        progress=None,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given directory.

        You can create datasets with this method via the following basic
        patterns:

        (a) Provide ``dataset_dir`` and ``dataset_type`` to import the contents
            of a directory that is organized in the default layout for the
            dataset type as documented in
            :ref:`this guide <loading-common-datasets>`

        (b) Provide ``dataset_type`` along with ``data_path``, ``labels_path``,
            or other type-specific parameters to perform a customized
            import. This syntax provides the flexibility to, for example,
            perform labels-only imports or imports where the source media lies
            in a different location than the labels

        In either workflow, the remaining parameters of this method can be
        provided to further configure the import.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
                    case, the ``dataset_dir`` has no effect on the location of
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_dir(
            dataset_dir=dataset_dir,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            progress=progress,
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
        persistent=False,
        overwrite=False,
        label_field=None,
        tags=None,
        dynamic=False,
        cleanup=True,
        progress=None,
        **kwargs,
    ):
        """Creates a :class:`Dataset` from the contents of the given archive.

        If a directory with the same root name as ``archive_path`` exists, it
        is assumed that this directory contains the extracted contents of the
        archive, and thus the archive is not re-extracted.

        See :ref:`this guide <loading-common-datasets>` for example usages
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead
            **kwargs: optional keyword arguments to pass to the constructor of
                the :class:`fiftyone.utils.data.importers.DatasetImporter` for
                the specified ``dataset_type``

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_archive(
            archive_path,
            dataset_type=dataset_type,
            data_path=data_path,
            labels_path=labels_path,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            cleanup=cleanup,
            progress=progress,
            **kwargs,
        )
        return dataset

    @classmethod
    def from_importer(
        cls,
        dataset_importer,
        name=None,
        persistent=False,
        overwrite=False,
        label_field=None,
        tags=None,
        dynamic=False,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_importer(
            dataset_importer,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            progress=progress,
        )
        return dataset

    @classmethod
    def from_images(
        cls,
        paths_or_samples,
        sample_parser=None,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_images(
            paths_or_samples,
            sample_parser=sample_parser,
            tags=tags,
            progress=progress,
        )
        return dataset

    @classmethod
    def from_labeled_images(
        cls,
        samples,
        sample_parser,
        name=None,
        persistent=False,
        overwrite=False,
        label_field=None,
        tags=None,
        dynamic=False,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_labeled_images(
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            progress=progress,
        )
        return dataset

    @classmethod
    def from_images_dir(
        cls,
        images_dir,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        recursive=True,
        progress=None,
    ):
        """Creates a :class:`Dataset` from the given directory of images.

        This operation does not read the images.

        Args:
            images_dir: a directory of images
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_images_dir(
            images_dir, tags=tags, recursive=recursive, progress=progress
        )
        return dataset

    @classmethod
    def from_images_patt(
        cls,
        images_patt,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        progress=None,
    ):
        """Creates a :class:`Dataset` from the given glob pattern of images.

        This operation does not read the images.

        Args:
            images_patt: a glob pattern of images like
                ``/path/to/images/*.jpg``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_images_patt(images_patt, tags=tags, progress=progress)
        return dataset

    @classmethod
    def from_videos(
        cls,
        paths_or_samples,
        sample_parser=None,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_videos(
            paths_or_samples,
            sample_parser=sample_parser,
            tags=tags,
            progress=progress,
        )
        return dataset

    @classmethod
    def from_labeled_videos(
        cls,
        samples,
        sample_parser,
        name=None,
        persistent=False,
        overwrite=False,
        label_field=None,
        tags=None,
        dynamic=False,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
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
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_labeled_videos(
            samples,
            sample_parser,
            label_field=label_field,
            tags=tags,
            dynamic=dynamic,
            progress=progress,
        )
        return dataset

    @classmethod
    def from_videos_dir(
        cls,
        videos_dir,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        recursive=True,
        progress=None,
    ):
        """Creates a :class:`Dataset` from the given directory of videos.

        This operation does not read/decode the videos.

        Args:
            videos_dir: a directory of videos
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample
            recursive (True): whether to recursively traverse subdirectories

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_videos_dir(
            videos_dir, tags=tags, recursive=recursive, progress=progress
        )
        return dataset

    @classmethod
    def from_videos_patt(
        cls,
        videos_patt,
        name=None,
        persistent=False,
        overwrite=False,
        tags=None,
        progress=None,
    ):
        """Creates a :class:`Dataset` from the given glob pattern of videos.

        This operation does not read/decode the videos.

        Args:
            videos_patt: a glob pattern of videos like
                ``/path/to/videos/*.mp4``
            name (None): a name for the dataset. By default,
                :func:`get_default_dataset_name` is used
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            tags (None): an optional tag or iterable of tags to attach to each
                sample

        Returns:
            a :class:`Dataset`
        """
        dataset = cls(name, persistent=persistent, overwrite=overwrite)
        dataset.add_videos_patt(videos_patt, tags=tags, progress=progress)
        return dataset

    @classmethod
    def from_dict(
        cls,
        d,
        name=None,
        persistent=False,
        overwrite=False,
        rel_dir=None,
        frame_labels_dir=None,
        progress=None,
    ):
        """Loads a :class:`Dataset` from a JSON dictionary generated by
        :meth:`fiftyone.core.collections.SampleCollection.to_dict`.

        The JSON dictionary can contain an export of any
        :class:`fiftyone.core.collections.SampleCollection`, e.g.,
        :class:`Dataset` or :class:`fiftyone.core.view.DatasetView`.

        Args:
            d: a JSON dictionary
            name (None): a name for the new dataset
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via :func:`fiftyone.core.storage.normalize_path`
            frame_labels_dir (None): a directory of per-sample JSON files
                containing the frame labels for video samples. If omitted, it
                is assumed that the frame labels are included directly in the
                provided JSON dict. Only applicable to datasets that contain
                videos
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        if name is None:
            name = d.get("name", None)
            if name is None:
                raise ValueError("Attempting to load a Dataset with no name.")

        if rel_dir is not None:
            rel_dir = fost.normalize_path(rel_dir)

        name = make_unique_dataset_name(name)
        dataset = cls(name, persistent=persistent, overwrite=overwrite)

        media_type = d.get("media_type", None)

        if media_type == fom.GROUP:
            dataset._doc.group_media_types = d.get("group_media_types", {})
            dataset._doc.default_group_slice = d.get(
                "default_group_slice", None
            )

        if media_type is not None:
            dataset.media_type = media_type

        dataset._apply_sample_field_schema(d.get("sample_fields", {}))
        dataset._apply_frame_field_schema(d.get("frame_fields", {}))

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
            _samples,
            expand_schema=False,
            progress=progress,
            num_samples=samples,
        )

        return dataset

    @classmethod
    def from_json(
        cls,
        path_or_str,
        name=None,
        persistent=False,
        overwrite=False,
        rel_dir=None,
        frame_labels_dir=None,
        progress=None,
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
            persistent (False): whether the dataset should persist in the
                database after the session terminates
            overwrite (False): whether to overwrite an existing dataset of
                the same name
            rel_dir (None): a relative directory to prepend to the ``filepath``
                of each sample, if the filepath is not absolute (begins with a
                path separator). The path is converted to an absolute path
                (if necessary) via :func:`fiftyone.core.storage.normalize_path`
            progress (None): whether to render a progress bar (True/False), use
                the default value ``fiftyone.config.show_progress_bars``
                (None), or a progress callback function to invoke instead

        Returns:
            a :class:`Dataset`
        """
        d = etas.load_json(path_or_str)
        return cls.from_dict(
            d,
            name=name,
            persistent=persistent,
            overwrite=overwrite,
            rel_dir=rel_dir,
            frame_labels_dir=frame_labels_dir,
            progress=progress,
        )

    def _add_view_stage(self, stage):
        return self.view().add_stage(stage)

    def _pipeline(
        self,
        pipeline=None,
        media_type=None,
        attach_frames=False,
        detach_frames=False,
        limit_frames=None,
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
            _pipeline.extend(
                self._attach_frames_pipeline(
                    limit=limit_frames, support=support
                )
            )

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

    def _attach_frames_pipeline(self, limit=None, support=None):
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

        pipeline = [
            {"$match": {"$expr": match_expr}},
            {"$sort": {"frame_number": 1}},
        ]

        if limit:
            pipeline.append({"$limit": limit})

        return [
            {
                "$lookup": {
                    "from": self._frame_collection_name,
                    "let": let,
                    "pipeline": pipeline,
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
        """A pipeline that attaches the requested group slice(s) for each
        document and stores them in under ``groups.<slice>`` keys.
        """
        if self.group_field is None:
            return []

        id_field = self.group_field + "._id"
        name_field = self.group_field + ".name"

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
                "$addFields": {
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
                "$addFields": {
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
        return self._get_sample_collection()

    def _get_sample_collection(self, write_concern=None):
        return foo.get_db_conn().get_collection(
            self._sample_collection_name, write_concern=write_concern
        )

    @property
    def _frame_collection_name(self):
        return self._doc.frame_collection_name

    @property
    def _frame_collection(self):
        return self._get_frame_collection()

    def _get_frame_collection(self, write_concern=None):
        if self._frame_collection_name is None:
            return None

        return foo.get_db_conn().get_collection(
            self._frame_collection_name, write_concern=write_concern
        )

    def _apply_sample_field_schema(self, schema):
        for field_name, field_or_str in schema.items():
            kwargs = foo.get_field_kwargs(field_or_str)
            self.add_sample_field(field_name, **kwargs)

    def _apply_frame_field_schema(self, schema):
        for field_name, field_or_str in schema.items():
            kwargs = foo.get_field_kwargs(field_or_str)
            self.add_frame_field(field_name, **kwargs)

    def _ensure_label_field(self, label_field, label_cls):
        if label_field not in self.get_field_schema():
            self.add_sample_field(
                label_field,
                fof.EmbeddedDocumentField,
                embedded_doc_type=label_cls,
            )

    def _expand_schema(self, sample, dynamic):
        expanded = False

        if not dynamic:
            schema = self.get_field_schema(include_private=True)

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

            if self.media_type == fom.GROUP and sample.media_type not in set(
                self.group_media_types.values()
            ):
                expanded |= self._sample_doc_cls.merge_field_schema(
                    {
                        "metadata": fo.EmbeddedDocumentField(
                            fome.get_metadata_cls(sample.media_type)
                        )
                    },
                    validate=False,
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

        self.add_group_slice(slice_name, media_type)

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

    def _make_sample(self, d):
        doc = self._sample_dict_to_doc(d)
        return fos.Sample.from_doc(doc, dataset=self)

    def _sample_dict_to_doc(self, d):
        try:
            return self._sample_doc_cls.from_dict(d)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._sample_doc_cls.from_dict(d)

    def _make_frame(self, d):
        doc = self._frame_dict_to_doc(d)
        return fofr.Frame.from_doc(doc, dataset=self)

    def _frame_dict_to_doc(self, d):
        try:
            return self._frame_doc_cls.from_dict(d)
        except:
            # The dataset's schema may have been changed in another process;
            # let's try reloading to see if that fixes things
            self.reload()

            return self._frame_doc_cls.from_dict(d, extended=False)

    def _validate_sample(self, sample):
        schema = self.get_field_schema(include_private=True)

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

        for field_name, value in sample.iter_fields(include_timestamps=True):
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
        """Clears the dataset's in-memory cache.

        Dataset caches may contain sample/frame singletons and
        annotation/brain/evaluation/custom runs.
        """
        fos.Sample._clear(self._sample_collection_name)
        if self._frame_collection_name is not None:
            fofr.Frame._clear(self._frame_collection_name)

        self._annotation_cache.clear()
        self._brain_cache.clear()
        self._evaluation_cache.clear()
        self._run_cache.clear()

    def _reload(self, hard=False):
        if not hard:
            self._doc.reload()
            return

        doc, sample_doc_cls, frame_doc_cls = _load_dataset(
            self, self.name, virtual=True
        )

        new_media_type = doc.media_type != self.media_type

        self._doc = doc
        self._sample_doc_cls = sample_doc_cls
        self._frame_doc_cls = frame_doc_cls

        if new_media_type:
            self._set_media_type(doc.media_type)

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

    def _update_last_loaded_at(self, force=False):
        if os.environ.get("FIFTYONE_SERVER", False) and not force:
            return

        self._doc._update_last_loaded_at()

    def _update_last_modified_at(self, last_modified_at=None):
        self._doc._update_last_modified_at(last_modified_at=last_modified_at)

    def _update_last_deletion_at(self, last_deletion_at=None):
        self._doc._update_last_deletion_at(last_deletion_at=last_deletion_at)


def _get_random_characters(n):
    return "".join(
        random.choice(string.ascii_lowercase + string.digits) for _ in range(n)
    )


def _list_datasets(include_private=False, glob_patt=None, tags=None):
    conn = foo.get_db_conn()
    query = _list_datasets_query(
        include_private=include_private, glob_patt=glob_patt, tags=tags
    )

    # We don't want an error here if `name == None`
    _sort = lambda l: sorted(l, key=lambda x: (x is None, x))

    return _sort(conn.datasets.find(query).distinct("name"))


def _list_datasets_info(include_private=False, glob_patt=None, tags=None):
    conn = foo.get_db_conn()
    query = _list_datasets_query(
        include_private=include_private, glob_patt=glob_patt, tags=tags
    )

    return [
        {
            "name": doc.get("name", None),
            "created_at": doc.get("created_at", None),
            "last_modified_at": doc.get("last_modified_at", None),
            "last_loaded_at": doc.get("last_loaded_at", None),
            "version": doc.get("version", None),
            "persistent": doc.get("persistent", None),
            "media_type": doc.get("media_type", None),
            "tags": doc.get("tags", []),
        }
        for doc in conn.datasets.find(query)
    ]


def _list_datasets_query(include_private=False, glob_patt=None, tags=None):
    if include_private:
        # Protect against empty dataset docs, which can sometimes occur for
        # reasons we don't fully understand
        query = {"name": {"$exists": 1}}
    else:
        # Datasets whose sample collections don't start with `samples.` are
        # private e.g., patches or frames datasets
        query = {"sample_collection_name": {"$regex": "^samples\\."}}

    if glob_patt is not None:
        query["name"] = {"$regex": fnmatch.translate(glob_patt)}

    if etau.is_str(tags):
        query["tags"] = tags
    elif tags is not None:
        query["tags"] = {"$in": list(tags)}

    return query


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
    now = datetime.utcnow()

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
        frame_collection_name = None
        frame_doc_cls = None
        frame_fields = None

    dataset_doc = foo.DatasetDocument(
        id=_id,
        name=name,
        slug=slug,
        version=focn.VERSION,
        created_at=now,
        last_modified_at=now,
        media_type=None,  # will be inferred when first sample is added
        sample_collection_name=sample_collection_name,
        frame_collection_name=frame_collection_name,
        persistent=persistent,
        sample_fields=sample_fields,
        frame_fields=frame_fields,
        app_config=DatasetAppConfig(),
    )
    dataset_doc.save(upsert=True)

    if _clips:
        _create_indexes(sample_collection_name, None)
    else:
        _create_indexes(sample_collection_name, frame_collection_name)

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _create_indexes(sample_collection_name, frame_collection_name):
    conn = foo.get_db_conn()

    if sample_collection_name is not None:
        sample_collection = conn[sample_collection_name]
        sample_collection.create_index("filepath")
        sample_collection.create_index("created_at")
        sample_collection.create_index("last_modified_at")

    if frame_collection_name is not None:
        frame_collection = conn[frame_collection_name]
        frame_collection.create_index(
            [("_sample_id", 1), ("frame_number", 1)], unique=True
        )
        frame_collection.create_index("created_at")
        frame_collection.create_index("last_modified_at")


def _create_group_indexes(sample_collection_name, group_field):
    conn = foo.get_db_conn()

    sample_collection = conn[sample_collection_name]
    sample_collection.create_index(group_field + "._id")
    sample_collection.create_index(group_field + ".name")


def _clone_indexes(src_collection, dst_doc, include_indexes=True):
    # Special syntax: copy indexes exactly from another collection
    if isinstance(include_indexes, foc.SampleCollection):
        _clone_indexes(include_indexes, dst_doc)
        return

    src_dataset = src_collection._dataset

    # Omit indexes on filtered fields
    skip = _get_clone_indexes_to_skip(src_collection)

    keep = _get_clone_indexes_to_keep(
        src_collection, include_indexes, include_default=True
    )

    _clone_collection_indexes(
        src_dataset._sample_collection_name,
        dst_doc.sample_collection_name,
        skip=skip,
        keep=keep,
    )

    if dst_doc.frame_collection_name is not None:
        # Omit indexes on filtered fields
        skip = _get_clone_indexes_to_skip(src_collection, frames=True)

        keep = _get_clone_indexes_to_keep(
            src_collection, include_indexes, include_default=True, frames=True
        )

        _clone_collection_indexes(
            src_dataset._frame_collection_name,
            dst_doc.frame_collection_name,
            skip=skip,
            keep=keep,
        )


def _clone_indexes_for_patches_view(
    src_collection,
    dst_dataset,
    patches_fields=None,
    other_fields=None,
    include_indexes=True,
):
    if include_indexes is False:
        return

    # Special syntax: copy indexes exactly from another collection
    if isinstance(include_indexes, foc.SampleCollection):
        _clone_indexes(include_indexes, dst_dataset._doc)
        return

    src_dataset = src_collection._dataset

    remap = {}
    if patches_fields is not None:
        for patches_field in patches_fields:
            dst_field = dst_dataset.get_field(patches_field)
            if isinstance(dst_field, fof.EmbeddedDocumentField):
                label_type = dst_field.document_type
                if issubclass(label_type, fol._HasLabelList):
                    # This view maintains label lists
                    # eg: `Detections` -> `Detections`
                    pass
                else:
                    # This view maps label lists to single labels
                    # eg: `Detections` -> `Detection`
                    label_list_type = fol._SINGLE_LABEL_TO_LIST_MAP[label_type]
                    src_field = (
                        patches_field + "." + label_list_type._LABEL_LIST_FIELD
                    )
                    remap[src_field] = patches_field

    if include_indexes is True:
        include_indexes = []

        if patches_fields is not None:
            remap_rev = {v: k for k, v in remap.items()}
            for patches_field in patches_fields:
                include_indexes.append(
                    remap_rev.get(patches_field, patches_field)
                )

        if other_fields:
            include_indexes.extend(other_fields)

    keep = _get_clone_indexes_to_keep(
        src_collection, include_indexes, remap=remap, dst_dataset=dst_dataset
    )

    _clone_collection_indexes(
        src_dataset._sample_collection_name,
        dst_dataset._sample_collection_name,
        keep=keep,
    )


def _clone_indexes_for_frames_view(
    src_collection, dst_dataset, include_indexes=True
):
    if include_indexes is False:
        return

    # Special syntax: copy indexes exactly from another collection
    if isinstance(include_indexes, foc.SampleCollection):
        _clone_indexes(include_indexes, dst_dataset._doc)
        return

    src_dataset = src_collection._dataset

    # Omit default indexes and indexes on filtered fields
    skip_indexes = src_collection._get_default_indexes(frames=True)
    skip = _get_clone_indexes_to_skip(
        src_collection, skip_indexes=skip_indexes, frames=True
    )

    keep = _get_clone_indexes_to_keep(
        src_collection, include_indexes, frames=True
    )

    _clone_collection_indexes(
        src_dataset._frame_collection_name,
        dst_dataset._sample_collection_name,
        skip=skip,
        keep=keep,
    )


def _clone_indexes_for_clips_view(
    src_collection,
    dst_dataset,
    clips_field=None,
    other_fields=None,
    include_indexes=True,
):
    if include_indexes is False:
        return

    # Special syntax: copy indexes exactly from another collection
    if isinstance(include_indexes, foc.SampleCollection):
        _clone_indexes(include_indexes, dst_dataset._doc)
        return

    src_dataset = src_collection._dataset

    remap = {}
    if clips_field is not None:
        src_field = src_collection.get_field(clips_field)
        if isinstance(src_field, fof.EmbeddedDocumentField):
            label_type = src_field.document_type
            if issubclass(label_type, fol._HasLabelList):
                # This view maps `TemporalDetections` to `Classification`
                src_root = clips_field + "." + label_type._LABEL_LIST_FIELD
                remap[src_root] = clips_field
            else:
                # This view maps `TemporalDetection` to `Classification`
                pass

    if include_indexes is True:
        include_indexes = []

        if clips_field is not None:
            remap_rev = {v: k for k, v in remap.items()}
            include_indexes.append(remap_rev.get(clips_field, clips_field))

        if other_fields:
            include_indexes.extend(other_fields)

    keep = _get_clone_indexes_to_keep(
        src_collection, include_indexes, remap=remap, dst_dataset=dst_dataset
    )

    _clone_collection_indexes(
        src_dataset._sample_collection_name,
        dst_dataset._sample_collection_name,
        keep=keep,
    )


def _get_clone_indexes_to_keep(
    src_collection,
    include_indexes,
    include_default=False,
    frames=False,
    remap=None,
    dst_dataset=None,
):
    if include_indexes is True:
        return None

    if include_indexes is False:
        include_indexes = []

    if etau.is_str(include_indexes):
        include_indexes = [include_indexes]

    if frames:
        prefix = src_collection._FRAMES_PREFIX
        include_indexes = [
            i[len(prefix) :] for i in include_indexes if i.startswith(prefix)
        ]
    elif src_collection._has_frame_fields():
        prefix = src_collection._FRAMES_PREFIX
        include_indexes = [
            i for i in include_indexes if not i.startswith(prefix)
        ]

    if include_default:
        default_indexes = src_collection._get_default_indexes(frames=frames)
        include_indexes = set(include_indexes) | set(default_indexes)

    if remap is None:
        fields_map = src_collection._get_db_fields_map(frames=frames)
        return [fields_map.get(f, f) for f in include_indexes]

    keep = {}
    for i in include_indexes:
        keep[i] = i

        for k, v in remap.items():
            if i == k:
                keep[i] = v
            elif i.startswith(k + "."):
                keep[i] = i.replace(k, v, 1)

    key_map = src_collection._get_db_fields_map(frames=frames)
    value_map = dst_dataset._get_db_fields_map()
    return {key_map.get(k, k): value_map.get(v, v) for k, v in keep.items()}


def _get_clone_indexes_to_skip(
    src_collection, skip_indexes=None, frames=False
):
    src_dataset = src_collection._dataset

    if skip_indexes is not None:
        skip_indexes = set(skip_indexes)

    if isinstance(src_collection, fov.DatasetView):
        view = src_collection
        selected_fields, excluded_fields = view._get_selected_excluded_fields(
            frames=frames
        )
    else:
        selected_fields, excluded_fields = None, None

    if (
        skip_indexes is None
        and selected_fields is None
        and excluded_fields is None
    ):
        return None

    if selected_fields is not None:
        selected_roots = {f.split(".", 1)[0] for f in selected_fields}
    else:
        selected_roots = None

    if frames:
        src_coll = src_dataset._frame_collection
        fields_map = src_dataset._get_db_fields_map(frames=True, reverse=True)
    else:
        src_coll = src_dataset._sample_collection
        fields_map = src_dataset._get_db_fields_map(reverse=True)

    skip = set()

    for name, index_info in src_coll.index_information().items():
        if skip_indexes is not None and name in skip_indexes:
            skip.add(name)

        for field, _ in index_info["key"]:
            field = fields_map.get(field, field)
            root = field.split(".", 1)[0]

            if (
                skip_indexes is not None
                and len(index_info["key"]) == 1
                and field in skip_indexes
            ):
                skip.add(name)

            if selected_roots is not None and root not in selected_roots:
                skip.add(name)

            if excluded_fields is not None and field in excluded_fields:
                skip.add(name)

    return skip


def _clone_collection_indexes(
    src_collection_name,
    dst_collection_name,
    skip=None,
    keep=None,
):
    if keep is not None and not isinstance(keep, dict):
        keep = {k: k for k in keep}

    conn = foo.get_db_conn()
    src_coll = conn[src_collection_name]
    dst_coll = conn[dst_collection_name]

    for name, index_info in src_coll.index_information().items():
        key = index_info.pop("key")
        index_info.pop("ns", None)
        index_info.pop("v", None)

        # `skip` must contain exact index names
        if skip is not None and name in skip:
            continue

        # `keep` can contain index names or prefixes to match
        if keep is not None:
            found = False

            for k, v in keep.items():
                if name == k:
                    name = v
                    found = True
                elif name.startswith(k + "."):
                    name = name.replace(k, v, 1)
                    found = True

                # `keep` can optionally remap field names/roots
                for idx, (field, order) in enumerate(key):
                    if field == k:
                        key[idx] = (v, order)
                        found = True
                    elif field.startswith(k + "."):
                        key[idx] = (field.replace(k, v, 1), order)
                        found = True

            if not found:
                continue

        dst_coll.create_index(key, name=name, **index_info)


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
    default_fields = set(doc_cls._fields.keys())
    if field_docs is not None:
        default_fields -= {field_doc.name for field_doc in field_docs}

    # Declare default fields that don't already exist
    now = datetime.utcnow()
    for field_name in default_fields:
        field = doc_cls._fields[field_name]

        if isinstance(field, fof.EmbeddedDocumentField):
            field = foo.create_field(field_name, **foo.get_field_kwargs(field))
        else:
            field = field.copy()

        field._set_created_at(now)
        doc_cls._declare_field(dataset, field_name, field)

    # Declare existing fields
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
    # pylint: disable=no-member
    db = foo.get_db_conn()
    res = db.datasets.find_one({"name": name})
    if not res:
        raise DatasetNotFoundError(name)
    dataset_doc = foo.DatasetDocument.from_dict(res)

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
    elif frame_collection_name is not None:
        frame_doc_cls = _create_frame_document_cls(
            obj, frame_collection_name, field_docs=dataset_doc.frame_fields
        )
    else:
        frame_doc_cls = None

    return dataset_doc, sample_doc_cls, frame_doc_cls


def _delete_dataset_doc(dataset_doc):
    for view_doc in dataset_doc.saved_views:
        if isinstance(view_doc, DBRef):
            continue

        view_doc.delete()

    for workspace_doc in dataset_doc.workspaces:
        if isinstance(workspace_doc, DBRef):
            continue

        workspace_doc.delete()

    for run_doc in dataset_doc.annotation_runs.values():
        if isinstance(run_doc, DBRef):
            continue

        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    for run_doc in dataset_doc.brain_methods.values():
        if isinstance(run_doc, DBRef):
            continue

        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    for run_doc in dataset_doc.evaluations.values():
        if isinstance(run_doc, DBRef):
            continue

        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    for run_doc in dataset_doc.runs.values():
        if isinstance(run_doc, DBRef):
            continue

        if run_doc.results is not None:
            run_doc.results.delete()

        run_doc.delete()

    from fiftyone.operators.delegated import DelegatedOperationService

    DelegatedOperationService().delete_for_dataset(dataset_id=dataset_doc.id)

    dataset_doc.delete()


def _clone_collection(
    sample_collection,
    name,
    persistent=False,
    include_indexes=True,
):
    slug = _validate_dataset_name(name)

    contains_videos = sample_collection._contains_videos(any_slice=True)

    if isinstance(sample_collection, fov.DatasetView):
        dataset = sample_collection._dataset
        view = sample_collection

        if view.media_type == fom.MIXED:
            raise ValueError("Cloning mixed views is not allowed")

        if view._is_dynamic_groups:
            raise ValueError("Cloning dynamic grouped views is not allowed")
    else:
        dataset = sample_collection
        view = None

    dataset._reload()

    #
    # Clone dataset document
    #

    dataset_doc = dataset._doc.copy(new_id=True)

    _id = dataset_doc.id
    now = datetime.utcnow()

    sample_collection_name = _make_sample_collection_name(_id)

    if contains_videos:
        frame_collection_name = _make_frame_collection_name(
            sample_collection_name
        )
    else:
        frame_collection_name = None

    dataset_doc.name = name
    dataset_doc.slug = slug
    dataset_doc.created_at = now
    dataset_doc.last_modified_at = now
    dataset_doc.last_deletion_at = None
    dataset_doc.last_loaded_at = None
    dataset_doc.persistent = persistent
    dataset_doc.sample_collection_name = sample_collection_name
    dataset_doc.frame_collection_name = frame_collection_name
    dataset_doc.media_type = sample_collection.media_type
    dataset_doc.group_field = sample_collection.group_field
    dataset_doc.group_media_types = sample_collection.group_media_types
    dataset_doc.default_group_slice = sample_collection.default_group_slice

    for field in dataset_doc.sample_fields:
        field._set_created_at(now)

    for field in dataset_doc.frame_fields or []:
        field._set_created_at(now)

    # Runs/views get special treatment at the end
    dataset_doc.workspaces.clear()
    dataset_doc.saved_views.clear()
    dataset_doc.annotation_runs.clear()
    dataset_doc.brain_methods.clear()
    dataset_doc.evaluations.clear()
    dataset_doc.runs.clear()

    if view is not None:
        # Respect filtered sample fields, if any
        keep_fields = set(view.get_field_schema().keys())
        dataset_doc.sample_fields = [
            f for f in dataset_doc.sample_fields if f.name in keep_fields
        ]

        # Respect filtered frame fields, if any
        if contains_videos:
            keep_fields = set(view.get_frame_field_schema().keys())
            dataset_doc.frame_fields = [
                f for f in dataset_doc.frame_fields if f.name in keep_fields
            ]

    dataset_doc.save(upsert=True)

    # Clone indexes
    _clone_indexes(
        sample_collection, dataset_doc, include_indexes=include_indexes
    )

    # Clone samples
    coll, pipeline = _get_samples_pipeline(sample_collection)
    pipeline.append(
        {
            "$addFields": {
                "_dataset_id": _id,
                "created_at": now,
                "last_modified_at": now,
            }
        }
    )
    pipeline.append({"$out": sample_collection_name})
    foo.aggregate(coll, pipeline)

    # Clone frames
    if contains_videos:
        coll, pipeline = _get_frames_pipeline(sample_collection)
        pipeline.append(
            {
                "$addFields": {
                    "_dataset_id": _id,
                    "created_at": now,
                    "last_modified_at": now,
                }
            }
        )
        pipeline.append({"$out": frame_collection_name})
        foo.aggregate(coll, pipeline)

    clone_dataset = load_dataset(name)

    # Clone extras (full datasets only)
    if view is None and (
        dataset.has_saved_views
        or dataset.has_workspaces
        or dataset.has_annotation_runs
        or dataset.has_brain_runs
        or dataset.has_evaluations
        or dataset.has_runs
    ):
        _clone_extras(dataset, clone_dataset, now)

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
        # Clips datasets use `sample_id` to associate with frames, but now as
        # a standalone collection, they must use `_id`
        coll = dataset._sample_collection
        pipeline = sample_collection._pipeline(attach_frames=True) + [
            {"$project": {"frames": True}},
            {"$unwind": "$frames"},
            {"$addFields": {"frames._sample_id": "$_id"}},
            {"$replaceRoot": {"newRoot": "$frames"}},
            {"$project": {"_id": False}},
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

    edited_fields = set(view._get_edited_fields() or [])
    if contains_videos:
        edited_fields.update(
            dataset._FRAMES_PREFIX + f
            for f in view._get_edited_fields(frames=True) or []
        )

    if not all_fields:
        edited_fields &= set(fields)

    for field in edited_fields:
        if dataset._is_read_only_field(field):
            raise ValueError("Cannot edit read-only field '%s'" % field)

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

    now = datetime.utcnow()

    #
    # Save samples
    #

    pipeline = view._pipeline(detach_frames=True, detach_groups=True)

    if sample_fields:
        project = {f: True for f in sample_fields}
        project["last_modified_at"] = now
        pipeline.append({"$project": project})
        pipeline.append({"$merge": dataset._sample_collection_name})
        foo.aggregate(dataset._sample_collection, pipeline)
    elif save_samples:
        pipeline.append({"$addFields": {"last_modified_at": now}})
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
        # the first occurrence of each frame
        if dataset._is_clips:
            pipeline.extend(
                [
                    {"$group": {"_id": "$_id", "doc": {"$first": "$$ROOT"}}},
                    {"$replaceRoot": {"newRoot": "$doc"}},
                ]
            )

        if frame_fields:
            project = {f: True for f in frame_fields}
            project["last_modified_at"] = now
            pipeline.append({"$project": project})
            pipeline.append({"$merge": dataset._frame_collection_name})
            foo.aggregate(dataset._sample_collection, pipeline)
        else:
            pipeline.append({"$addFields": {"last_modified_at": now}})
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

    if isinstance(collection_or_doc, foc.SampleCollection):
        # Respects filtered schemas, if any
        same_dataset = collection_or_doc._root_dataset is dataset
        doc = collection_or_doc._root_dataset._doc
        schema = collection_or_doc.get_field_schema()
        frame_schema = collection_or_doc.get_frame_field_schema() or {}
    else:
        same_dataset = False
        doc = collection_or_doc
        schema = {f.name: f.to_field() for f in doc.sample_fields}
        frame_schema = {f.name: f.to_field() for f in doc.frame_fields or []}

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

            _create_group_indexes(
                dataset._sample_collection_name, doc.group_field
            )
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

        if dataset._frame_collection is None and any(
            media_type == fom.VIDEO
            for media_type in src_group_media_types.values()
        ):
            dataset._init_frames()
            dataset.save()

        if curr_doc.default_group_slice is None:
            curr_doc.default_group_slice = src_default_group_slice

        if dataset._group_slice is None:
            dataset._group_slice = src_default_group_slice
    elif src_media_type not in (None, dataset.media_type):
        raise ValueError(
            "Cannot merge a collection with media_type='%s' into a dataset "
            "with media_type='%s'" % (src_media_type, dataset.media_type)
        )

    has_frame_fields = dataset._has_frame_fields()

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

    if has_frame_fields and frame_schema:
        dataset._frame_doc_cls.merge_field_schema(
            frame_schema, expand_schema=expand_schema
        )

    if same_dataset or not merge_info:
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


def _clone_extras(src_dataset, dst_dataset, now):
    src_doc = src_dataset._doc
    dst_doc = dst_dataset._doc

    # Clone saved views
    for _view_doc in src_doc.get_saved_views():
        view_doc = _clone_reference_doc(_view_doc)
        view_doc.dataset_id = dst_doc.id
        view_doc.created_at = now
        view_doc.last_modified_at = now
        view_doc.save(upsert=True, virtual=True)

        dst_doc.saved_views.append(view_doc)

    # Clone workspaces
    for _workspace_doc in src_doc.get_workspaces():
        workspace_doc = _clone_reference_doc(_workspace_doc)
        workspace_doc.dataset_id = dst_doc.id
        workspace_doc.created_at = now
        workspace_doc.last_modified_at = now
        workspace_doc.save(upsert=True, virtual=True)

        dst_doc.workspaces.append(workspace_doc)

    # Clone annotation runs
    for anno_key, _run_doc in src_doc.get_annotation_runs().items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.timestamp = now
        run_doc.save(upsert=True)

        dst_doc.annotation_runs[anno_key] = run_doc

    # Clone brain method runs
    for brain_key, _run_doc in src_doc.get_brain_methods().items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.timestamp = now
        run_doc.save(upsert=True)

        dst_doc.brain_methods[brain_key] = run_doc

    # Clone evaluation runs
    for eval_key, _run_doc in src_doc.get_evaluations().items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.timestamp = now
        run_doc.save(upsert=True)

        dst_doc.evaluations[eval_key] = run_doc

    # Clone other runs
    for run_key, _run_doc in src_doc.get_runs().items():
        run_doc = _clone_run(_run_doc)
        run_doc.dataset_id = dst_doc.id
        run_doc.timestamp = now
        run_doc.save(upsert=True)

        dst_doc.runs[run_key] = run_doc

    dst_doc.save()


def _clone_reference_doc(ref_doc):
    _ref_doc = ref_doc.copy(new_id=True)
    return _ref_doc


def _clone_run(run_doc):
    _run_doc = run_doc.copy(new_id=True)
    _run_doc.results = None

    # Unfortunately the only way to copy GridFS files is to read-write them...
    # https://jira.mongodb.org/browse/TOOLS-2208
    if run_doc.results:
        run_doc.results.seek(0)
        results_bytes = run_doc.results.read()
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
        if name in coll.index_information():
            coll.drop_index(name)

    if dropped_index:
        coll.create_index(db_field)


def _cleanup_frame_index(dataset, index):
    coll = dataset._frame_collection

    if index in coll.index_information():
        coll.drop_index(index)


def _get_single_index_map(coll):
    # db_field -> (name, unique)
    return {
        v["key"][0][0]: (k, v.get("unique", False))
        for k, v in coll.index_information().items()
        if len(v["key"]) == 1
    }


def _get_collstats(coll):
    pipeline = [
        {"$collStats": {"storageStats": {}}},
        {"$replaceRoot": {"newRoot": "$storageStats"}},
    ]
    return next(coll.aggregate(pipeline))


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
        dst_samples = dataset.select_group_slices(_allow_mixed=True)
        src_samples = sample_collection.select_group_slices(_allow_mixed=True)
    else:
        dst_samples = dataset
        src_samples = sample_collection

    if contains_videos:
        old_ids = src_samples.values("id")
        num_ids = len(old_ids)
    else:
        num_ids = len(src_samples)

    now = datetime.utcnow()

    add_fields = {
        "_dataset_id": dataset._doc.id,
        "created_at": now,
        "last_modified_at": now,
    }

    if contains_groups:
        id_field = sample_collection.group_field + "._id"
        tmp_field = sample_collection.group_field + "._tmp"
        add_fields[tmp_field] = "$" + id_field

    src_samples._aggregate(
        detach_frames=True,
        detach_groups=True,
        post_pipeline=[
            {"$project": {"_id": False}},
            {"$addFields": add_fields},
            {
                "$merge": {
                    "into": dataset._sample_collection_name,
                    "whenMatched": "keepExisting",
                    "whenNotMatched": "insert",
                }
            },
        ],
    )

    new_ids = dst_samples[-num_ids:].values("id")

    if contains_groups:
        ops = []
        for old_id in src_samples.distinct(id_field):
            new_id = ObjectId()
            op = UpdateMany(
                {tmp_field: old_id},
                {"$set": {id_field: new_id}, "$unset": {tmp_field: ""}},
            )
            ops.append(op)

        dataset._bulk_write(ops, ids=[])

    if not contains_videos:
        return new_ids

    if contains_groups:
        src_videos = sample_collection.select_group_slices(
            media_type=fom.VIDEO
        )
    else:
        src_videos = sample_collection

    src_videos._aggregate(
        frames_only=True,
        post_pipeline=[
            {
                "$addFields": {
                    "_tmp": "$_sample_id",
                    "_sample_id": {"$rand": {}},  # must exist for index
                }
            },
            {"$project": {"_id": False}},
            {
                "$addFields": {
                    "_dataset_id": dataset._doc.id,
                    "created_at": now,
                    "last_modified_at": now,
                }
            },
            {
                "$merge": {
                    "into": dataset._frame_collection_name,
                    "whenMatched": "keepExisting",
                    "whenNotMatched": "insert",
                }
            },
        ],
    )

    ops = [
        UpdateMany(
            {"_tmp": ObjectId(old_id)},
            {"$set": {"_sample_id": ObjectId(new_id)}, "$unset": {"_tmp": ""}},
        )
        for old_id, new_id in zip(old_ids, new_ids)
    ]

    dataset._bulk_write(ops, ids=[], frames=True)

    return new_ids


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
    merge_embedded_docs=False,
    overwrite=True,
    expand_schema=True,
    dynamic=False,
    progress=None,
    num_samples=None,
):
    if dataset.media_type == fom.GROUP:
        dst = dataset.select_group_slices(_allow_mixed=True)
    else:
        dst = dataset

    if (
        isinstance(samples, foc.SampleCollection)
        and samples.media_type == fom.GROUP
    ):
        samples = samples.select_group_slices(_allow_mixed=True)

    if num_samples is None:
        num_samples = samples

    if key_fcn is None:
        id_map = {k: v for k, v in zip(*dst.values([key_field, "_id"]))}
        key_fcn = lambda sample: sample[key_field]
    else:
        id_map = {}
        logger.info("Indexing dataset...")
        for sample in dst.iter_samples(progress=progress):
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
        merge_embedded_docs=merge_embedded_docs,
        overwrite=overwrite,
        expand_schema=expand_schema,
    )

    logger.info("Merging samples...")
    dataset._upsert_samples(
        _samples,
        expand_schema=expand_schema,
        dynamic=dynamic,
        progress=progress,
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
    merge_embedded_docs=False,
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
                    merge_embedded_docs=merge_embedded_docs,
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
    merge_embedded_docs=False,
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
        sample_pipeline.append({"$project": {f: False for f in unset_fields}})

    if skip_existing:
        when_matched = "keepExisting"
    else:
        # We had to include all default fields since they are required if new
        # samples are inserted, but, when merging, the user may have wanted
        # them excluded
        delete_fields = {"created_at"}
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
            merge_embedded_docs=merge_embedded_docs,
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

    now = datetime.utcnow()

    sample_pipeline.extend(
        [
            {
                "$addFields": {
                    "_dataset_id": dst_dataset._doc.id,
                    "created_at": now,  # only used when adding new samples
                    "last_modified_at": now,
                }
            },
            {
                "$merge": {
                    "into": dst_dataset._sample_collection_name,
                    "on": key_field,
                    "whenMatched": when_matched,
                    "whenNotMatched": when_not_matched,
                }
            },
        ]
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
    #   and destination collections corresponding to its parent sample in a
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

        _omit_frame_fields.add("id")
        _omit_frame_fields.discard(frame_key_field)
        _omit_frame_fields.discard("frame_number")

        unset_fields = [db_fields_map.get(f, f) for f in _omit_frame_fields]
        frame_pipeline.append({"$project": {f: False for f in unset_fields}})

        if skip_existing:
            when_frame_matched = "keepExisting"
        else:
            delete_fields = {"created_at"}
            when_frame_matched = _merge_docs(
                src_collection,
                merge_lists=merge_lists,
                merge_embedded_docs=merge_embedded_docs,
                fields=frame_fields,
                omit_fields=omit_frame_fields,
                delete_fields=delete_fields,
                overwrite=overwrite,
                frames=True,
            )

        frame_pipeline.extend(
            [
                {
                    "$addFields": {
                        "_dataset_id": dst_dataset._doc.id,
                        "_sample_id": "$" + frame_key_field,
                        "created_at": now,  # only used when adding new frames
                        "last_modified_at": now,
                    }
                },
                {
                    "$merge": {
                        "into": dst_dataset._frame_collection_name,
                        "on": [frame_key_field, "frame_number"],
                        "whenMatched": when_frame_matched,
                        "whenNotMatched": "insert",
                    }
                },
            ]
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
            _index_frames(dst_dataset, key_field, frame_key_field)
            _index_frames(src_dataset, key_field, frame_key_field)

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
    merge_embedded_docs=False,
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

    # Identify list fields that need merging
    if merge_lists:
        list_fields, elem_fields = _init_merge_lists(
            schema, fields=fields, omit_fields=omit_fields
        )
    else:
        list_fields = None
        elem_fields = None

    # Identify embedded document fields that need merging
    if merge_embedded_docs:
        (
            doc_fields,
            doc_list_fields,
            doc_elem_fields,
        ) = _init_merge_embedded_docs(
            schema,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
        )
    else:
        doc_fields = None
        doc_list_fields = None
        doc_elem_fields = None

    #
    # It is possible that the user is mapping data *into* an embedded field
    # eg: fields={"ground_truth": "data.gt"}
    #
    # We must handle such cases by:
    #   1. always merging the "data" field, even if merging embedded documents
    #      wasn't explicitly requested
    #   2. moving any embedded list fields associated with "data" into the
    #      per-doc lists
    #
    if fields is not None:
        embedded_roots = set()
        for k, v in fields.items():
            if "." in v:
                root = v.split(".", 1)[0]
                embedded_roots.add(root)

        if embedded_roots and not merge_embedded_docs:
            doc_fields = []
            if merge_lists:
                doc_list_fields = defaultdict(list)
                doc_elem_fields = defaultdict(list)

        for root in embedded_roots:
            if root not in doc_fields:
                doc_fields.append(root)

            if merge_lists:
                for i in range(len(list_fields)):
                    f = list_fields[i]
                    if f.startswith(root + "."):
                        del list_fields[i]
                        doc_list_fields[root].append(f[len(root + ".") :])

                for i in range(len(elem_fields)):
                    f = elem_fields[i]
                    if f.startswith(root + "."):
                        del elem_fields[i]
                        doc_elem_fields[root].append(f[len(root + ".") :])

    # Handle merging of simple fields
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
                    "cond": {
                        "$and": [
                            {"$ne": ["$$item.k", "last_modified_at"]},
                            {"$ne": ["$$item.v", None]},
                        ]
                    },
                }
            }
        }

        docs = [new_doc, root_doc]

    # Handle merging of list fields
    if list_fields or elem_fields:
        doc = {}

        if list_fields:
            for list_field in list_fields:
                _merge_list_field(doc, list_field)

        if elem_fields:
            for elem_field in elem_fields:
                _merge_label_list_field(doc, elem_field, overwrite=overwrite)

        docs.append(doc)

    # Handle merging of embedded document fields
    if doc_fields:
        doc = {}

        for doc_field in doc_fields:
            if merge_lists:
                _doc_list_fields = doc_list_fields.get(doc_field, [])
                _doc_elem_fields = doc_elem_fields.get(doc_field, [])
            else:
                _doc_list_fields = None
                _doc_elem_fields = None

            _merge_embedded_doc_field(
                doc,
                doc_field,
                list_fields=_doc_list_fields,
                elem_fields=_doc_elem_fields,
                overwrite=overwrite,
            )

        docs.append(doc)

    return [{"$replaceWith": {"$mergeObjects": docs}}]


def _init_merge_lists(schema, fields=None, omit_fields=None):
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
        elif isinstance(field_type, fof.EmbeddedDocumentField) and issubclass(
            field_type.document_type, fol._HasLabelList
        ):
            root = fields[field] if fields is not None else field
            elem_fields.append(
                root + "." + field_type.document_type._LABEL_LIST_FIELD
            )

    return list_fields, elem_fields


def _init_merge_embedded_docs(
    schema, fields=None, omit_fields=None, merge_lists=True
):
    doc_fields = []

    if merge_lists:
        doc_list_fields = {}
        doc_elem_fields = {}
    else:
        doc_list_fields = None
        doc_elem_fields = None

    for field, field_type in schema.items():
        if fields is not None and field not in fields:
            continue

        if omit_fields is not None and field in omit_fields:
            continue

        if isinstance(
            field_type, fof.EmbeddedDocumentField
        ) and not issubclass(field_type.document_type, fol._HasLabelList):
            root = fields[field] if fields is not None else field
            doc_fields.append(root)

            if merge_lists:
                _schema = field_type.get_field_schema()
                _fields = _filter_by_root(fields, root)
                _omit_fields = _filter_by_root(omit_fields, root)

                _list_fields, _elem_fields = _init_merge_lists(
                    _schema, fields=_fields, omit_fields=_omit_fields
                )

                doc_list_fields[root] = _list_fields
                doc_elem_fields[root] = _elem_fields

    return doc_fields, doc_list_fields, doc_elem_fields


def _filter_by_root(fields, root):
    if fields is None:
        return None

    is_dict = isinstance(fields, dict)
    if is_dict:
        fields = list(fields.values())

    _fields = []
    for f in fields:
        if f.startswith(root + "."):
            _fields.append(f[len(root + ".") :])

    if not _fields:
        return None

    if is_dict:
        return {f: f for f in _fields}

    return _fields


def _merge_list_field(doc, list_field, root=None):
    if root is not None:
        list_path = root + "." + list_field
    else:
        list_path = list_field

    doc[list_field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": ["$" + list_path, None]}},
                    "then": "$$new." + list_path,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + list_path, None]}},
                    "then": "$" + list_path,
                },
            ],
            "default": {
                "$concatArrays": [
                    "$" + list_path,
                    {
                        "$filter": {
                            "input": "$$new." + list_path,
                            "as": "this",
                            "cond": {
                                "$not": {"$in": ["$$this", "$" + list_path]}
                            },
                        }
                    },
                ]
            },
        }
    }


def _merge_label_list_field(doc, elem_field, root=None, overwrite=False):
    field, leaf = elem_field.rsplit(".", 1)

    if root is not None:
        elem_path = root + "." + elem_field
        field_path = root + "." + field
    else:
        elem_path = elem_field
        field_path = field

    if overwrite:
        root_path = "$$new." + field_path
        elements = {
            "$reverseArray": {
                "$let": {
                    "vars": {
                        "new_ids": {
                            "$map": {
                                "input": "$$new." + elem_path,
                                "as": "this",
                                "in": "$$this._id",
                            },
                        },
                    },
                    "in": {
                        "$reduce": {
                            "input": {"$reverseArray": "$" + elem_path},
                            "initialValue": {
                                "$reverseArray": "$$new." + elem_path
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
        root_path = "$" + field_path
        elements = {
            "$let": {
                "vars": {
                    "existing_ids": {
                        "$map": {
                            "input": "$" + elem_path,
                            "as": "this",
                            "in": "$$this._id",
                        },
                    },
                },
                "in": {
                    "$reduce": {
                        "input": "$$new." + elem_path,
                        "initialValue": "$" + elem_path,
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
                    "case": {"$not": {"$gt": ["$" + field_path, None]}},
                    "then": "$$new." + field_path,
                },
                {
                    "case": {"$not": {"$gt": ["$$new." + field_path, None]}},
                    "then": "$" + field_path,
                },
            ],
            "default": {"$mergeObjects": [root_path, {leaf: elements}]},
        }
    }


def _merge_embedded_doc_field(
    doc,
    doc_field,
    list_fields=None,
    elem_fields=None,
    overwrite=False,
):
    if overwrite:
        root_field = "$" + doc_field
        new_field = "$$new." + doc_field
    else:
        root_field = "$$new." + doc_field
        new_field = "$" + doc_field

    # Handle merging of simple fields
    root_doc = root_field
    new_doc = {
        "$arrayToObject": {
            "$filter": {
                "input": {"$objectToArray": new_field},
                "as": "item",
                "cond": {
                    "$and": [
                        {"$ne": ["$$item.v", None]},
                    ]
                },
            }
        }
    }

    docs = [root_doc, new_doc]

    # Handle merging of nested list fields
    if list_fields or elem_fields:
        list_doc = {}

        if list_fields:
            for list_field in list_fields:
                _merge_list_field(list_doc, list_field, root=doc_field)

        if elem_fields:
            for elem_field in elem_fields:
                _merge_label_list_field(
                    list_doc, elem_field, root=doc_field, overwrite=overwrite
                )

        docs.append(list_doc)

    doc[doc_field] = {
        "$switch": {
            "branches": [
                {
                    "case": {"$not": {"$gt": [root_field, None]}},
                    "then": new_field,
                },
                {
                    "case": {"$not": {"$gt": [new_field, None]}},
                    "then": root_field,
                },
            ],
            "default": {"$mergeObjects": docs},
        }
    }


def _index_frames(dataset, key_field, frame_key_field):
    if dataset.media_type == fom.GROUP:
        dst_videos = dataset.select_group_slices(media_type=fom.VIDEO)
    else:
        dst_videos = dataset

    ids, keys, all_sample_ids = dst_videos.values(
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

    dst_videos.set_values(
        "frames." + frame_key_field,
        frame_keys,
        expand_schema=False,
        _allow_missing=True,
    )


def _always_select_field(sample_collection, field):
    if not isinstance(sample_collection, fov.DatasetView):
        return sample_collection

    view = sample_collection

    if not any(isinstance(stage, fot.SelectFields) for stage in view._stages):
        return view

    # Manually insert `field` into all `SelectFields` stages
    _view = view._base_view
    for stage in view._stages:
        if isinstance(stage, fot.SelectFields):
            stage = fot.SelectFields(
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
    for _, value in sample.iter_fields():
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


def _discard_none(values):
    values = set(values)
    values.discard(None)
    return list(values)


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


def _handle_nested_fields(schema):
    safe_schemas = []

    while True:
        _now = {}
        _later = {}
        for path, field in schema.items():
            if any(path.startswith(p + ".") for p in schema.keys()):
                _later[path] = field
            else:
                _now[path] = field

        safe_schemas.append(_now)

        if _later:
            schema = _later
        else:
            break

    return safe_schemas


def _set_field_read_only(field_doc, read_only):
    field_doc.read_only = read_only
    if hasattr(field_doc, "fields"):
        for _field_doc in field_doc.fields:
            _set_field_read_only(_field_doc, read_only)


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
