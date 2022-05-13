"""
Dataset importers.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import copy
import inspect
import logging
import os
import random

from bson import json_util
import cv2

import eta.core.datasets as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.video as etav

import fiftyone.core.annotation as foa
import fiftyone.core.brain as fob
import fiftyone.core.dataset as fod
import fiftyone.core.evaluation as foe
import fiftyone.core.frame as fof
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.media as fomm
import fiftyone.core.odm as foo
import fiftyone.core.runs as fors
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou
import fiftyone.migrations as fomi
import fiftyone.types as fot

from .parsers import (
    FiftyOneImageClassificationSampleParser,
    FiftyOneTemporalDetectionSampleParser,
    FiftyOneImageDetectionSampleParser,
    FiftyOneImageLabelsSampleParser,
    FiftyOneVideoLabelsSampleParser,
)


logger = logging.getLogger(__name__)


def import_samples(
    dataset,
    dataset_importer,
    label_field=None,
    tags=None,
    expand_schema=True,
    add_info=True,
):
    """Adds the samples from the given :class:`DatasetImporter` to the dataset.

    See :ref:`this guide <custom-dataset-importer>` for more details about
    importing datasets in custom formats by defining your own
    :class:`DatasetImporter`.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        dataset_importer: a :class:`DatasetImporter`
        label_field (None): controls the field(s) in which imported labels are
            stored. Only applicable if ``dataset_importer`` is a
            :class:`LabeledImageDatasetImporter` or
            :class:`LabeledVideoDatasetImporter`. If the importer produces a
            single :class:`fiftyone.core.labels.Label` instance per
            sample/frame, this argument specifies the name of the field to use;
            the default is ``"ground_truth"``. If the importer produces a
            dictionary of labels per sample, this argument specifies a string
            prefix to prepend to each label key; the default in this case is to
            directly use the keys of the imported label dictionaries as field
            names
        tags (None): an optional tag or iterable of tags to attach to each
            sample
        expand_schema (True): whether to dynamically add new sample fields
            encountered to the dataset schema. If False, an error is raised
            if a sample's schema is not a subset of the dataset schema
        add_info (True): whether to add dataset info from the importer (if
            any) to the dataset

    Returns:
        a list of IDs of the samples that were added to the dataset
    """
    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    dataset_importer = _handle_legacy_formats(dataset_importer)

    # Batch imports
    if isinstance(dataset_importer, BatchDatasetImporter):
        # @todo support `expand_schema=False` here?
        if not expand_schema:
            logger.warning(
                "`expand_schema=False` is not supported for %s instances",
                BatchDatasetImporter,
            )

        if not add_info:
            logger.warning(
                "`add_info=False` is not supported for %s instances",
                BatchDatasetImporter,
            )

        with dataset_importer:
            return dataset_importer.import_samples(dataset, tags=tags)

    #
    # Non-batch imports
    #

    with dataset_importer:
        parse_sample, expand_schema = _build_parse_sample_fcn(
            dataset, dataset_importer, label_field, tags, expand_schema
        )

        try:
            num_samples = len(dataset_importer)
        except:
            num_samples = None

        samples = map(parse_sample, iter(dataset_importer))
        sample_ids = dataset.add_samples(
            samples, expand_schema=expand_schema, num_samples=num_samples
        )

        if add_info and dataset_importer.has_dataset_info:
            info = dataset_importer.get_dataset_info()
            if info:
                parse_dataset_info(dataset, info)

        if isinstance(dataset_importer, LegacyFiftyOneDatasetImporter):
            dataset_importer.import_run_results(dataset)

    return sample_ids


def merge_samples(
    dataset,
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
    add_info=True,
):
    """Merges the samples from the given :class:`DatasetImporter` into the
    dataset.

    See :ref:`this guide <custom-dataset-importer>` for more details about
    importing datasets in custom formats by defining your own
    :class:`DatasetImporter`.

    By default, samples with the same absolute ``filepath`` are merged, but you
    can customize this behavior via the ``key_field`` and ``key_fcn``
    parameters. For example, you could set
    ``key_fcn = lambda sample: os.path.basename(sample.filepath)`` to merge
    samples with the same base filename.

    The behavior of this method is highly customizable. By default, all
    top-level fields from the imported samples are merged in, overwriting any
    existing values for those fields, with the exception of list fields
    (e.g., ``tags``) and label list fields (e.g.,
    :class:`fiftyone.core.labels.Detections` fields), in which case the
    elements of the lists themselves are merged. In the case of label list
    fields, labels with the same ``id`` in both collections are updated rather
    than duplicated.

    To avoid confusion between missing fields and fields whose value is
    ``None``, ``None``-valued fields are always treated as missing while
    merging.

    This method can be configured in numerous ways, including:

    -   Whether existing samples should be modified or skipped
    -   Whether new samples should be added or omitted
    -   Whether new fields can be added to the dataset schema
    -   Whether list fields should be treated as ordinary fields and merged as
        a whole rather than merging their elements
    -   Whether to merge only specific fields, or all but certain fields
    -   Mapping input fields to different field names of this dataset

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        dataset_importer: a :class:`DatasetImporter`
        label_field (None): controls the field(s) in which imported labels are
            stored. Only applicable if ``dataset_importer`` is a
            :class:`LabeledImageDatasetImporter` or
            :class:`LabeledVideoDatasetImporter`. If the importer produces a
            single :class:`fiftyone.core.labels.Label` instance per
            sample/frame, this argument specifies the name of the field to use;
            the default is ``"ground_truth"``. If the importer produces a
            dictionary of labels per sample, this argument specifies a string
            prefix to prepend to each label key; the default in this case is to
            directly use the keys of the imported label dictionaries as field
            names
        tags (None): an optional tag or iterable of tags to attach to each
            sample
        key_field ("filepath"): the sample field to use to decide whether to
            join with an existing sample
        key_fcn (None): a function that accepts a
            :class:`fiftyone.core.sample.Sample` instance and computes a key to
            decide if two samples should be merged. If a ``key_fcn`` is
            provided, ``key_field`` is ignored
        skip_existing (False): whether to skip existing samples (True) or merge
            them (False)
        insert_new (True): whether to insert new samples (True) or skip them
            (False)
        fields (None): an optional field or iterable of fields to which to
            restrict the merge. If provided, fields other than these are
            omitted from ``samples`` when merging or adding samples. One
            exception is that ``filepath`` is always included when adding new
            samples, since the field is required. This can also be a dict
            mapping field names of the input collection to field names of this
            dataset
        omit_fields (None): an optional field or iterable of fields to exclude
            from the merge. If provided, these fields are omitted from imported
            samples, if present. One exception is that ``filepath`` is always
            included when adding new samples, since the field is required
        merge_lists (True): whether to merge the elements of list fields
            (e.g., ``tags``) and label list fields (e.g.,
            :class:`fiftyone.core.labels.Detections` fields) rather than
            merging the entire top-level field like other field types. For
            label lists fields, existing :class:`fiftyone.core.label.Label`
            elements are either replaced (when ``overwrite`` is True) or kept
            (when ``overwrite`` is False) when their ``id`` matches a label
            from the provided samples
        overwrite (True): whether to overwrite (True) or skip (False) existing
            fields and label elements
        expand_schema (True): whether to dynamically add new fields encountered
            to the dataset schema. If False, an error is raised if a sample's
            schema is not a subset of the dataset schema
        add_info (True): whether to add dataset info from the importer (if any)
            to the dataset
    """
    if etau.is_str(tags):
        tags = [tags]
    elif tags is not None:
        tags = list(tags)

    dataset_importer = _handle_legacy_formats(dataset_importer)

    #
    # Batch imports
    #

    if isinstance(dataset_importer, BatchDatasetImporter):
        tmp = fod.Dataset()
        with dataset_importer:
            dataset_importer.import_samples(tmp, tags=tags)

        dataset.merge_samples(
            tmp,
            key_field=key_field,
            key_fcn=key_fcn,
            skip_existing=skip_existing,
            insert_new=insert_new,
            fields=fields,
            omit_fields=omit_fields,
            merge_lists=merge_lists,
            overwrite=overwrite,
            expand_schema=expand_schema,
            include_info=add_info,
            overwrite_info=True,
        )

        tmp.delete()

        return

    #
    # Non-batch imports
    #

    with dataset_importer:
        parse_sample, expand_schema = _build_parse_sample_fcn(
            dataset, dataset_importer, label_field, tags, expand_schema
        )

        try:
            num_samples = len(dataset_importer)
        except:
            num_samples = None

        samples = map(parse_sample, iter(dataset_importer))

        dataset.merge_samples(
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
            num_samples=num_samples,
        )

        if add_info and dataset_importer.has_dataset_info:
            info = dataset_importer.get_dataset_info()
            if info:
                parse_dataset_info(dataset, info)

        if isinstance(dataset_importer, LegacyFiftyOneDatasetImporter):
            dataset_importer.import_run_results(dataset)


def _handle_legacy_formats(dataset_importer):
    if (
        isinstance(dataset_importer, FiftyOneDatasetImporter)
        and dataset_importer._is_legacy_format_data()
    ):
        logger.debug(
            "Found data in LegacyFiftyOneDataset format; converting to legacy "
            "importer now"
        )
        return dataset_importer._to_legacy_importer()

    return dataset_importer


def _build_parse_sample_fcn(
    dataset, dataset_importer, label_field, tags, expand_schema
):
    if isinstance(dataset_importer, GenericSampleDatasetImporter):
        # Generic sample dataset

        #
        # If the importer provides a sample field schema, apply it now
        #
        # This is more efficient than adding samples with
        # `expand_schema == True`. Also, ensures that all fields exist with
        # the appropriate types, even if all of the imported samples have
        # `None` values
        #
        if expand_schema and dataset_importer.has_sample_field_schema:
            dataset._apply_field_schema(
                dataset_importer.get_sample_field_schema()
            )
            expand_schema = False

        def parse_sample(sample):
            if tags:
                sample.tags.extend(tags)

            return sample

    elif isinstance(dataset_importer, UnlabeledImageDatasetImporter):
        # Unlabeled image dataset

        # The schema never needs expanding when importing unlabeled samples
        expand_schema = False

        def parse_sample(sample):
            image_path, image_metadata = sample
            return Sample(
                filepath=image_path,
                metadata=image_metadata,
                tags=tags,
            )

    elif isinstance(dataset_importer, UnlabeledVideoDatasetImporter):
        # Unlabeled video dataset

        # The schema never needs expanding when importing unlabeled samples
        expand_schema = False

        def parse_sample(sample):
            video_path, video_metadata = sample
            return Sample(
                filepath=video_path,
                metadata=video_metadata,
                tags=tags,
            )

    elif isinstance(dataset_importer, LabeledImageDatasetImporter):
        # Labeled image dataset

        if label_field:
            label_key = lambda k: label_field + "_" + k
        else:
            label_field = "ground_truth"
            label_key = lambda k: k

        def parse_sample(sample):
            image_path, image_metadata, label = sample
            sample = Sample(
                filepath=image_path,
                metadata=image_metadata,
                tags=tags,
            )

            if isinstance(label, dict):
                sample.update_fields(
                    {label_key(k): v for k, v in label.items()}
                )
            elif label is not None:
                sample[label_field] = label

            return sample

        # Optimization: if we can deduce exactly what fields will be added
        # during import, we declare them now and set `expand_schema` to False
        try:
            can_expand_now = issubclass(dataset_importer.label_cls, fol.Label)
        except:
            can_expand_now = False

        if expand_schema and can_expand_now:
            dataset._ensure_label_field(
                label_field, dataset_importer.label_cls
            )
            expand_schema = False

    elif isinstance(dataset_importer, LabeledVideoDatasetImporter):
        # Labeled video dataset

        if label_field:
            label_key = lambda k: label_field + "_" + k
        else:
            label_field = "ground_truth"
            label_key = lambda k: k

        def parse_sample(sample):
            video_path, video_metadata, label, frames = sample

            sample = Sample(
                filepath=video_path,
                metadata=video_metadata,
                tags=tags,
            )

            if isinstance(label, dict):
                sample.update_fields(
                    {label_key(k): v for k, v in label.items()}
                )
            elif label is not None:
                sample[label_field] = label

            if frames is not None:
                frame_labels = {}

                for frame_number, _label in frames.items():
                    if isinstance(_label, dict):
                        frame_labels[frame_number] = {
                            label_key(field_name): label
                            for field_name, label in _label.items()
                        }
                    elif _label is not None:
                        frame_labels[frame_number] = {label_field: _label}

                sample.frames.merge(frame_labels)

            return sample

    else:
        raise ValueError(
            "Unsupported DatasetImporter type %s" % type(dataset_importer)
        )

    return parse_sample, expand_schema


def build_dataset_importer(
    dataset_type, strip_none=True, warn_unused=True, name=None, **kwargs
):
    """Builds the :class:`DatasetImporter` instance for the given parameters.

    Args:
        dataset_type: the :class:`fiftyone.types.dataset_types.Dataset` type
        strip_none (True): whether to exclude None-valued items from ``kwargs``
        warn_unused (True): whether to issue warnings for any non-None unused
            parameters encountered
        name (None): the name of the dataset being imported into, if known
        **kwargs: keyword arguments to pass to the dataset importer's
            constructor via ``DatasetImporter(**kwargs)``

    Returns:
        a tuple of:

        -   the :class:`DatasetImporter` instance
        -   a dict of unused keyword arguments
    """
    if dataset_type is None:
        raise ValueError(
            "You must provide a `dataset_type` in order to build a dataset "
            "importer"
        )

    if inspect.isclass(dataset_type):
        dataset_type = dataset_type()

    # If we're importing TFRecords, they must be unpacked into an `images_dir`
    # during import
    if (
        isinstance(
            dataset_type,
            (fot.TFImageClassificationDataset, fot.TFObjectDetectionDataset),
        )
        and "images_dir" not in kwargs
    ):
        if name is None:
            name = fod.get_default_dataset_name()

        images_dir = fod.get_default_dataset_dir(name)
        logger.info(
            "Unpacking images to '%s'. Pass the `images_dir` parameter to "
            "customize this",
            images_dir,
        )
        kwargs["images_dir"] = images_dir

    dataset_importer_cls = dataset_type.get_dataset_importer_cls()

    if strip_none:
        kwargs = {k: v for k, v in kwargs.items() if v is not None}

    kwargs, unused_kwargs = fou.extract_kwargs_for_class(
        dataset_importer_cls, kwargs
    )

    try:
        dataset_importer = dataset_importer_cls(**kwargs)
    except Exception as e:
        raise ValueError(
            "Failed to construct importer of type %s using the provided "
            "parameters. See above for the error. You may need to supply "
            "additional mandatory arguments. Please consult the documentation "
            "of %s to learn more"
            % (dataset_importer_cls, dataset_importer_cls)
        ) from e

    if warn_unused:
        for key, value in unused_kwargs.items():
            if value is not None:
                logger.warning(
                    "Ignoring unsupported parameter '%s' for importer type %s",
                    key,
                    dataset_importer_cls,
                )

    return dataset_importer, unused_kwargs


def parse_dataset_info(dataset, info, overwrite=True):
    """Parses the info returned by :meth:`DatasetImporter.get_dataset_info` and
    stores it on the relevant properties of the dataset.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
        info: an info dict
        overwrite (True): whether to overwrite existing dataset info fields
    """
    classes = info.pop("classes", None)
    if isinstance(classes, dict):
        if overwrite:
            dataset.classes.update(classes)
        else:
            _update_no_overwrite(dataset.classes, classes)
    elif isinstance(classes, list):
        if overwrite or not dataset.default_classes:
            dataset.default_classes = classes

    default_classes = info.pop("default_classes", None)
    if default_classes is not None:
        if overwrite or not dataset.default_classes:
            dataset.default_classes = default_classes

    mask_targets = info.pop("mask_targets", None)
    if mask_targets is not None:
        mask_targets = dataset._parse_mask_targets(mask_targets)
        if overwrite:
            dataset.mask_targets.update(mask_targets)
        else:
            _update_no_overwrite(dataset.mask_targets, mask_targets)

    default_mask_targets = info.pop("default_mask_targets", None)
    if default_mask_targets is not None:
        if overwrite or not dataset.default_mask_targets:
            dataset.default_mask_targets = dataset._parse_default_mask_targets(
                default_mask_targets
            )

    skeletons = info.pop("skeletons", None)
    if skeletons is not None:
        skeletons = dataset._parse_skeletons(skeletons)
        if overwrite:
            dataset.skeletons.update(skeletons)
        else:
            _update_no_overwrite(dataset.skeletons, skeletons)

    default_skeleton = info.pop("default_skeleton", None)
    if default_skeleton is not None:
        if overwrite or not dataset.default_skeleton:
            dataset.default_skeleton = dataset._parse_default_skeleton(
                default_skeleton
            )

    if overwrite:
        dataset.info.update(info)
    else:
        _update_no_overwrite(dataset.info, info)

    dataset.save()


def _update_no_overwrite(d, dnew):
    d.update({k: v for k, v in dnew.items() if k not in d})


class ImportPathsMixin(object):
    """Mixin for :class:`DatasetImporter` classes that provides convenience
    methods for parsing the ``data_path`` and ``labels_path`` parameters
    supported by many importers.
    """

    @staticmethod
    def _parse_data_path(dataset_dir=None, data_path=None, default=None):
        """Helper function that computes default values for the ``data_path``
        parameter supported by many importers.
        """
        if data_path is None:
            if dataset_dir is not None:
                data_path = default

        if isinstance(data_path, dict):
            return data_path

        if data_path is not None:
            data_path = os.path.expanduser(data_path)

            if not os.path.isabs(data_path) and dataset_dir is not None:
                dataset_dir = fou.normalize_path(dataset_dir)
                data_path = os.path.join(dataset_dir, data_path)
            else:
                data_path = fou.normalize_path(data_path)

            if not os.path.exists(data_path):
                if os.path.isfile(data_path + ".json"):
                    data_path += ".json"

        return data_path

    @staticmethod
    def _parse_labels_path(dataset_dir=None, labels_path=None, default=None):
        """Helper function that computes default values for the ``labels_path``
        parameter supported by many importers.
        """
        if labels_path is None:
            if dataset_dir is not None:
                labels_path = default

        if labels_path is not None:
            labels_path = os.path.expanduser(labels_path)

            if not os.path.isabs(labels_path) and dataset_dir is not None:
                dataset_dir = fou.normalize_path(dataset_dir)
                labels_path = os.path.join(dataset_dir, labels_path)
            else:
                labels_path = fou.normalize_path(labels_path)

        return labels_path

    @staticmethod
    def _load_data_map(data_path, ignore_exts=False, recursive=False):
        """Helper function that parses either a data directory or a data
        manifest file into a UUID -> filepath map.
        """
        if ignore_exts:
            to_uuid = lambda p: fou.normpath(os.path.splitext(p)[0])
        else:
            to_uuid = lambda p: fou.normpath(p)

        if isinstance(data_path, dict):
            return {to_uuid(k): fou.normpath(v) for k, v in data_path.items()}

        if not data_path:
            return {}

        if data_path.endswith(".json"):
            if not os.path.isfile(data_path):
                raise ValueError(
                    "Data manifest '%s' does not exist" % data_path
                )

            data_map = etas.read_json(data_path)
            data_root = os.path.dirname(data_path)
            return {
                to_uuid(k): fou.normpath(os.path.join(data_root, v))
                for k, v in data_map.items()
            }

        if not os.path.isdir(data_path):
            raise ValueError("Data directory '%s' does not exist" % data_path)

        return {
            to_uuid(p): fou.normpath(os.path.join(data_path, p))
            for p in etau.list_files(data_path, recursive=recursive)
        }


class DatasetImporter(object):
    """Base interface for importing datasets stored on disk into FiftyOne.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self, dataset_dir=None, shuffle=False, seed=None, max_samples=None
    ):
        if dataset_dir is not None:
            dataset_dir = fou.normalize_path(dataset_dir)

        self.dataset_dir = dataset_dir
        self.shuffle = shuffle
        self.seed = seed
        self.max_samples = max_samples

    def __enter__(self):
        self.setup()
        return self

    def __exit__(self, *args):
        self.close(*args)

    def __iter__(self):
        return self

    def __len__(self):
        """The total number of samples that will be imported.

        Raises:
            TypeError: if the total number is not known
        """
        raise TypeError(
            "The number of samples in this %s is not known a priori"
            % type(self)
        )

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            subclass-specific information for the sample

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_dataset_info(self):
        """Whether this importer produces a dataset info dictionary."""
        raise NotImplementedError("subclass must implement has_dataset_info")

    def setup(self):
        """Performs any necessary setup before importing the first sample in
        the dataset.

        This method is called when the importer's context manager interface is
        entered, :func:`DatasetImporter.__enter__`.
        """
        pass

    def get_dataset_info(self):
        """Returns the dataset info for the dataset.

        By convention, this method should be called after all samples in the
        dataset have been imported.

        Returns:
            a dict of dataset info
        """
        if not self.has_dataset_info:
            raise ValueError(
                "This %s does not provide dataset info" % type(self)
            )

        raise NotImplementedError("subclass must implement get_dataset_info()")

    def close(self, *args):
        """Performs any necessary actions after the last sample has been
        imported.

        This method is called when the importer's context manager interface is
        exited, :func:`DatasetImporter.__exit__`.

        Args:
            *args: the arguments to :func:`DatasetImporter.__exit__`
        """
        pass

    def _preprocess_list(self, l):
        """Internal utility that preprocesses the given list---which is
        presumed to be a list defining the samples that should be imported---by
        applying the values of the ``shuffle``, ``seed``, and ``max_samples``
        parameters of the importer.

        Args:
            l: a list

        Returns:
            a processed copy of the list
        """
        if self.shuffle:
            if self.seed is not None:
                random.seed(self.seed)

            l = copy(l)
            random.shuffle(l)

        if self.max_samples is not None:
            l = l[: self.max_samples]

        return l


class BatchDatasetImporter(DatasetImporter):
    """Base interface for importers that load all of their samples in a single
    call to :meth:`import_samples`.

    This interface allows for greater efficiency for import formats that
    handle aggregating over the samples themselves.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        raise ValueError(
            "%s instances cannot be iterated over. Use import_samples() "
            "instead" % type(self)
        )

    @property
    def has_dataset_info(self):
        return False

    def import_samples(self, dataset, tags=None):
        """Imports the samples into the given dataset.

        Args:
            dataset: a :class:`fiftyone.core.dataset.Dataset`
            tags (None): an optional list of tags to attach to each sample

        Returns:
            a list of IDs of the samples that were added to the dataset
        """
        raise NotImplementedError("subclass must implement import_samples()")


class GenericSampleDatasetImporter(DatasetImporter):
    """Interface for importing datasets that contain arbitrary
    :class:`fiftyone.core.sample.Sample` instances.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            a :class:`fiftyone.core.sample.Sample` instance

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_sample_field_schema(self):
        """Whether this importer produces a sample field schema."""
        raise NotImplementedError("subclass must implement has_dataset_info")

    def get_sample_field_schema(self):
        """Returns dictionary describing the field schema of the samples loaded
        by this importer.

        The returned dictionary should map field names to to string
        representations of :class:`fiftyone.core.fields.Field` instances
        generated by ``str(field)``.

        Returns:
            a dict
        """
        if not self.has_sample_field_schema:
            raise ValueError(
                "This '%s' does not provide a sample field schema"
                % etau.get_class_name(self)
            )

        raise NotImplementedError(
            "subclass must implement get_sample_field_schema()"
        )


class UnlabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of unlabeled image samples.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an ``(image_path, image_metadata)`` tuple, where

            -   ``image_path``: the path to the image on disk
            -   ``image_metadata``: an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :meth:`has_image_metadata` is ``False``

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")


class UnlabeledVideoDatasetImporter(DatasetImporter):
    """Interface for importing datasets of unlabeled video samples.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an ``(video_path, video_metadata)`` tuple, where

            -   ``video_path``: the path to the video on disk
            -   ``video_metadata``: an
                :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                video, or ``None`` if :meth:`has_video_metadata` is ``False``

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_video_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")


class LabeledImageDatasetImporter(DatasetImporter):
    """Interface for importing datasets of labeled image samples.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an  ``(image_path, image_metadata, label)`` tuple, where

            -   ``image_path``: the path to the image on disk
            -   ``image_metadata``: an
                :class:`fiftyone.core.metadata.ImageMetadata` instances for the
                image, or ``None`` if :meth:`has_image_metadata` is ``False``
            -   ``label``: an instance of :meth:`label_cls`, or a dictionary
                mapping field names to :class:`fiftyone.core.labels.Label`
                instances, or ``None`` if the sample is unlabeled

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_image_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.ImageMetadata` instances for each image.
        """
        raise NotImplementedError("subclass must implement has_image_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the importer can produce a single label field of any of
            these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return label dictionaries with keys
            and value-types specified by this dictionary. Not all keys need be
            present in the imported labels
        -   ``None``. In this case, the importer makes no guarantees about the
            labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")


class LabeledVideoDatasetImporter(DatasetImporter):
    """Interface for importing datasets of labeled video samples.

    Typically, dataset importers should implement the parameters documented on
    this class, although this is not mandatory.

    See :ref:`this page <writing-a-custom-dataset-importer>` for information
    about implementing/using dataset importers.

    .. automethod:: __len__
    .. automethod:: __next__

    Args:
        dataset_dir (None): the dataset directory. This may be optional for
            some importers
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __next__(self):
        """Returns information about the next sample in the dataset.

        Returns:
            an  ``(video_path, video_metadata, labels, frames)`` tuple, where

            -   ``video_path``: the path to the video on disk
            -   ``video_metadata``: an
                :class:`fiftyone.core.metadata.VideoMetadata` instances for the
                video, or ``None`` if :meth:`has_video_metadata` is ``False``
            -   ``labels``: sample-level labels for the video, which can be any
                of the following:

                -   a :class:`fiftyone.core.labels.Label` instance
                -   a dictionary mapping label fields to
                    :class:`fiftyone.core.labels.Label` instances
                -   ``None`` if the sample has no sample-level labels

            -   ``frames``: frame-level labels for the video, which can
                be any of the following:

                -   a dictionary mapping frame numbers to dictionaries that
                    map label fields to :class:`fiftyone.core.labels.Label`
                    instances for each video frame
                -   ``None`` if the sample has no frame-level labels

        Raises:
            StopIteration: if there are no more samples to import
        """
        raise NotImplementedError("subclass must implement __next__()")

    @property
    def has_video_metadata(self):
        """Whether this importer produces
        :class:`fiftyone.core.metadata.VideoMetadata` instances for each video.
        """
        raise NotImplementedError("subclass must implement has_video_metadata")

    @property
    def label_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer within the sample-level labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return sample-level labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the importer can produce a single sample-level label
            field of any of these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return sample-level label
            dictionaries with keys and value-types specified by this
            dictionary. Not all keys need be present in the imported labels
        -   ``None``. In this case, the importer makes no guarantees about the
            sample-level labels that it may return
        """
        raise NotImplementedError("subclass must implement label_cls")

    @property
    def frame_labels_cls(self):
        """The :class:`fiftyone.core.labels.Label` class(es) returned by this
        importer within the frame labels that it produces.

        This can be any of the following:

        -   a :class:`fiftyone.core.labels.Label` class. In this case, the
            importer is guaranteed to return frame labels of this type
        -   a list or tuple of :class:`fiftyone.core.labels.Label` classes. In
            this case, the importer can produce a single frame label field of
            any of these types
        -   a dict mapping keys to :class:`fiftyone.core.labels.Label` classes.
            In this case, the importer will return frame label dictionaries
            with keys and value-types specified by this dictionary. Not all
            keys need be present in each frame
        -   ``None``. In this case, the importer makes no guarantees about the
            frame labels that it may return
        """
        raise NotImplementedError("subclass must implement frame_labels_cls")


class LegacyFiftyOneDatasetImporter(GenericSampleDatasetImporter):
    """Legacy importer for FiftyOne datasets stored on disk in a serialized
    JSON format.

    .. warning::

        The :class:`fiftyone.types.dataset_types.FiftyOneDataset` format was
        upgraded in ``fiftyone==0.8`` and this importer is now deprecated.

        However, to maintain backwards compatibility,
        :class:`FiftyOneDatasetImporter` will check for instances of datasets
        of this type at runtime and defer to this class to load them.

    Args:
        dataset_dir: the dataset directory
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self, dataset_dir, shuffle=False, seed=None, max_samples=None
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self._metadata = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._frame_labels_dir = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None
        self._is_video_dataset = False

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        d = next(self._iter_samples)

        # Convert filepath to absolute path
        d["filepath"] = os.path.join(self.dataset_dir, d["filepath"])

        if self._is_video_dataset:
            labels_relpath = d.pop("frames")
            labels_path = os.path.join(self.dataset_dir, labels_relpath)

            sample = Sample.from_dict(d)
            self._import_frame_labels(sample, labels_path)
        else:
            sample = Sample.from_dict(d)

        return sample

    @property
    def has_sample_field_schema(self):
        if self._is_video_dataset:
            return False

        return "sample_fields" in self._metadata

    @property
    def has_dataset_info(self):
        return "info" in self._metadata

    def setup(self):
        metadata_path = os.path.join(self.dataset_dir, "metadata.json")
        if os.path.isfile(metadata_path):
            metadata = etas.read_json(metadata_path)
            media_type = metadata.get("media_type", fomm.IMAGE)
            self._metadata = metadata
            self._is_video_dataset = media_type == fomm.VIDEO
        else:
            self._metadata = {}

        self._anno_dir = os.path.join(self.dataset_dir, "annotations")
        self._brain_dir = os.path.join(self.dataset_dir, "brain")
        self._eval_dir = os.path.join(self.dataset_dir, "evaluations")
        self._frame_labels_dir = os.path.join(self.dataset_dir, "frames")

        samples_path = os.path.join(self.dataset_dir, "samples.json")
        samples = etas.read_json(samples_path).get("samples", [])

        self._samples = self._preprocess_list(samples)
        self._num_samples = len(self._samples)

    def get_sample_field_schema(self):
        return self._metadata.get("sample_fields", {})

    def get_dataset_info(self):
        return self._metadata.get("info", {})

    def import_run_results(self, sample_collection):
        dataset = sample_collection._dataset

        #
        # Import annotation runs
        #

        annotation_runs = self._metadata.get("annotation_runs", None)
        if annotation_runs:
            d = {k: json_util.loads(v) for k, v in annotation_runs.items()}
            d = dataset._doc.field_to_python("annotation_runs", d)
            for anno_key, run_doc in d.items():
                # Results are stored in GridFS, which we import separately next
                run_doc["results"] = None

                if dataset.has_annotation_run(anno_key):
                    logger.warning(
                        "Overwriting existing annotation run '%s'", anno_key
                    )
                    dataset.delete_annotation_run(anno_key)

            dataset._doc.annotation_runs.update(d)
            _import_run_results(
                dataset,
                self._anno_dir,
                foa.AnnotationMethod,
                keys=list(d.keys()),
            )
            dataset._doc.save()

        #
        # Import brain method runs
        #

        brain_methods = self._metadata.get("brain_methods", None)
        if brain_methods:
            d = {k: json_util.loads(v) for k, v in brain_methods.items()}
            d = dataset._doc.field_to_python("brain_methods", d)
            for brain_key, run_doc in d.items():
                # Results are stored in GridFS, which we import separately next
                run_doc["results"] = None

                if dataset.has_brain_run(brain_key):
                    logger.warning(
                        "Overwriting existing brain run '%s'", brain_key
                    )
                    dataset.delete_brain_run(brain_key)

            dataset._doc.brain_methods.update(d)
            _import_run_results(
                dataset, self._brain_dir, fob.BrainMethod, keys=list(d.keys())
            )
            dataset._doc.save()

        #
        # Import evaluations
        #

        evaluations = self._metadata.get("evaluations", None)
        if evaluations:
            d = {k: json_util.loads(v) for k, v in evaluations.items()}
            d = dataset._doc.field_to_python("evaluations", d)
            for eval_key, run_doc in d.items():
                # Results are stored in GridFS, which we import separately next
                run_doc["results"] = None

                if dataset.has_evaluation(eval_key):
                    logger.warning(
                        "Overwriting existing evaluation '%s'", eval_key
                    )
                    dataset.delete_evaluation(eval_key)

            dataset._doc.evaluations.update(d)
            _import_run_results(
                dataset,
                self._eval_dir,
                foe.EvaluationMethod,
                keys=list(d.keys()),
            )
            dataset._doc.save()

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        metadata_path = os.path.join(dataset_dir, "metadata.json")
        if not os.path.isfile(metadata_path):
            return None

        metadata = etas.read_json(metadata_path)

        classes = metadata.get("default_classes", None)
        if classes:
            return classes

        classes = metadata.get("classes", {})
        if classes:
            return next(iter(classes.values()))

        return metadata.get("info", {}).get("classes", None)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(os.path.join(dataset_dir, "data")))

    def _import_frame_labels(self, sample, labels_path):
        frames_map = etas.read_json(labels_path).get("frames", {})
        for key, value in frames_map.items():
            sample.frames[int(key)] = fof.Frame.from_dict(value)


class FiftyOneDatasetImporter(BatchDatasetImporter):
    """Importer for FiftyOne datasets stored on disk in serialized JSON format.

    See :ref:`this page <FiftyOneDataset-import>` for format details.

    Args:
        dataset_dir: the dataset directory
        rel_dir (None): a relative directory to prepend to the ``filepath``
            of each sample if the filepath is not absolute. This path is
            converted to an absolute path (if necessary) via
            :func:`fiftyone.core.utils.normalize_path`
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        rel_dir=None,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.rel_dir = rel_dir

        self._data_dir = None
        self._anno_dir = None
        self._brain_dir = None
        self._eval_dir = None
        self._metadata_path = None
        self._samples_path = None
        self._frames_path = None

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")
        self._anno_dir = os.path.join(self.dataset_dir, "annotations")
        self._brain_dir = os.path.join(self.dataset_dir, "brain")
        self._eval_dir = os.path.join(self.dataset_dir, "evaluations")
        self._metadata_path = os.path.join(self.dataset_dir, "metadata.json")
        self._samples_path = os.path.join(self.dataset_dir, "samples.json")
        self._frames_path = os.path.join(self.dataset_dir, "frames.json")

    def import_samples(self, dataset, tags=None):
        dataset_dict = foo.import_document(self._metadata_path)

        if len(dataset) > 0 and fomi.needs_migration(
            head=dataset_dict["version"]
        ):
            # A migration is required in order to load this dataset, and the
            # dataset we're loading into is non-empty, so we must first load
            # into a temporary dataset, perform the migration, and then merge
            # into the destination dataset
            tmp_dataset = fod.Dataset()
            sample_ids = self._import_samples(
                tmp_dataset, dataset_dict, tags=tags
            )
            dataset.add_collection(tmp_dataset)
            tmp_dataset.delete()
            return sample_ids

        return self._import_samples(dataset, dataset_dict, tags=tags)

    def _import_samples(self, dataset, dataset_dict, tags=None):
        name = dataset.name
        empty_import = not bool(dataset)

        #
        # Import DatasetDocument
        #
        # This method handles two cases:
        #   - `dataset` is empty, and a migration may or may not be required
        #   - `dataset` is non-empty but no migration is required
        #

        if empty_import:
            #
            # The `dataset` we're importing into is empty, so we replace its
            # backing document with `dataset_dict`, except for the
            # metadata-related fields listed below, which we keep in `dataset`
            #
            # Note that we must work with dicts instead of `DatasetDocument`s
            # here because the import may need migration
            #
            doc = dataset._doc
            dataset_dict.update(
                dict(
                    _id=doc.id,
                    name=doc.name,
                    persistent=doc.persistent,
                    created_at=doc.created_at,
                    last_loaded_at=doc.last_loaded_at,
                    sample_collection_name=doc.sample_collection_name,
                    frame_collection_name=doc.frame_collection_name,
                )
            )

            # Run results are imported separately

            for run_doc in dataset_dict.get("evaluations", {}).values():
                run_doc["results"] = None

            for run_doc in dataset_dict.get("brain_methods", {}).values():
                run_doc["results"] = None

            conn = foo.get_db_conn()
            conn.datasets.replace_one({"name": name}, dataset_dict)

            dataset._reload(hard=True)
        else:
            #
            # The dataset we're merging into is non-empty, but it is safe to
            # use `DatasetDocument` here to perform the merge because no
            # migration should be required
            #
            new_doc = foo.DatasetDocument.from_dict(dataset_dict)
            dataset._merge_doc(new_doc)

        #
        # Import samples
        #

        logger.info("Importing samples...")
        samples = foo.import_collection(self._samples_path).get("samples", [])

        samples = self._preprocess_list(samples)

        if self.rel_dir is not None:
            # Prepend `rel_dir` to all relative paths
            rel_dir = fou.normalize_path(self.rel_dir)
        else:
            # Prepend `dataset_dir` to all relative paths
            rel_dir = self.dataset_dir

        for sample in samples:
            filepath = sample["filepath"]
            if not os.path.isabs(filepath):
                sample["filepath"] = os.path.join(rel_dir, filepath)

        if tags is not None:
            for sample in samples:
                sample["tags"].extend(tags)

        foo.insert_documents(samples, dataset._sample_collection, ordered=True)

        sample_ids = [s["_id"] for s in samples]

        #
        # Import frames
        #

        if os.path.isfile(self._frames_path):
            logger.info("Importing frames...")
            frames = foo.import_collection(self._frames_path).get("frames", [])

            if self.max_samples is not None:
                frames = [
                    f for f in frames if f["_sample_id"] in set(sample_ids)
                ]

            foo.insert_documents(
                frames, dataset._frame_collection, ordered=True
            )

        #
        # Import Run results
        #

        if empty_import:
            if os.path.isdir(self._anno_dir):
                _import_run_results(
                    dataset, self._anno_dir, foa.AnnotationMethod
                )

            if os.path.isdir(self._brain_dir):
                _import_run_results(dataset, self._brain_dir, fob.BrainMethod)

            if os.path.isdir(self._eval_dir):
                _import_run_results(
                    dataset, self._eval_dir, foe.EvaluationMethod
                )

        #
        # Migrate dataset if necessary
        #

        fomi.migrate_dataset_if_necessary(name)
        dataset._reload(hard=True)

        logger.info("Import complete")

        return sample_ids

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        metadata_path = os.path.join(dataset_dir, "metadata.json")
        metadata = etas.read_json(metadata_path)

        classes = metadata.get("default_classes", None)
        if classes:
            return classes

        classes = metadata.get("classes", {})
        if classes:
            return next(iter(classes.values()))

        return metadata.get("info", {}).get("classes", None)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        samples_path = os.path.join(dataset_dir, "samples.json")
        samples = etas.read_json(samples_path).get("samples", [])
        return len(samples)

    def _is_legacy_format_data(self):
        metadata_path = os.path.join(self.dataset_dir, "metadata.json")
        if os.path.isfile(metadata_path):
            metadata = etas.read_json(metadata_path)
        else:
            metadata = {}

        return "version" not in metadata

    def _to_legacy_importer(self):
        return LegacyFiftyOneDatasetImporter(
            self.dataset_dir,
            shuffle=self.shuffle,
            seed=self.seed,
            max_samples=self.max_samples,
        )


def _import_run_results(dataset, run_dir, run_cls, keys=None):
    if keys is None:
        keys = [os.path.splitext(f)[0] for f in etau.list_files(run_dir)]

    for key in keys:
        json_path = os.path.join(run_dir, key + ".json")
        if os.path.isfile(json_path):
            view = run_cls.load_run_view(dataset, key)
            run_info = run_cls.get_run_info(dataset, key)
            config = run_info.config
            d = etas.read_json(json_path)
            results = fors.RunResults.from_dict(d, view, config)
            run_cls.save_run_results(dataset, key, results, cache=False)


class ImageDirectoryImporter(UnlabeledImageDatasetImporter):
    """Importer for a directory of images stored on disk.

    See :ref:`this page <ImageDirectory-import>` for format details.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.recursive = recursive
        self.compute_metadata = compute_metadata

        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        image_path = next(self._iter_filepaths)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    def setup(self):
        filepaths = etau.list_files(
            self.dataset_dir, abs_paths=True, recursive=self.recursive
        )
        filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]
        filepaths = self._preprocess_list(filepaths)

        self._filepaths = filepaths
        self._num_samples = len(filepaths)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        filepaths = etau.list_files(dataset_dir, recursive=True)
        filepaths = [p for p in filepaths if etai.is_image_mime_type(p)]
        return len(filepaths)


class VideoDirectoryImporter(UnlabeledVideoDatasetImporter):
    """Importer for a directory of videos stored on disk.

    See :ref:`this page <VideoDirectory-import>` for format details.

    Args:
        dataset_dir: the dataset directory
        recursive (True): whether to recursively traverse subdirectories
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        recursive=True,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.recursive = recursive
        self.compute_metadata = compute_metadata

        self._filepaths = None
        self._iter_filepaths = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filepaths = iter(self._filepaths)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        video_path = next(self._iter_filepaths)

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        return video_path, video_metadata

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    def setup(self):
        filepaths = etau.list_files(
            self.dataset_dir, abs_paths=True, recursive=self.recursive
        )
        filepaths = [p for p in filepaths if etav.is_video_mime_type(p)]
        filepaths = self._preprocess_list(filepaths)

        self._filepaths = filepaths
        self._num_samples = len(filepaths)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        filepaths = etau.list_files(dataset_dir, recursive=True)
        filepaths = [p for p in filepaths if etav.is_video_mime_type(p)]
        return len(filepaths)


class FiftyOneImageClassificationDatasetImporter(
    LabeledImageDatasetImporter, ImportPathsMixin
):
    """Importer for image classification datasets stored on disk in a simple
    JSON format.

    See :ref:`this page <FiftyOneImageClassificationDataset-import>` for format
    details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.compute_metadata = compute_metadata

        self._classes = None
        self._sample_parser = None
        self._image_paths_map = None
        self._labels_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        image_path = self._image_paths_map[uuid]
        target = self._labels_map[uuid]

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        self._sample_parser.with_sample((image_path, target))
        label = self._sample_parser.get_label()

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return self._classes is not None

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return (fol.Classification, fol.Classifications)

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.read_json(self.labels_path)
            labels = {fou.normpath(k): v for k, v in labels.items()}
        else:
            labels = {}

        labels_map = labels.get("labels", {})
        classes = labels.get("classes", None)
        uuids = self._preprocess_list(sorted(labels_map.keys()))

        self._classes = classes

        self._sample_parser = FiftyOneImageClassificationSampleParser()
        self._sample_parser.classes = self._classes

        self._uuids = uuids
        self._image_paths_map = image_paths_map
        self._labels_map = labels_map
        self._num_samples = len(uuids)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return labels.get("classes", None)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return len(labels.get("labels", {}))


class ImageClassificationDirectoryTreeImporter(LabeledImageDatasetImporter):
    """Importer for an image classification directory tree stored on disk.

    See :ref:`this page <ImageClassificationDirectoryTree-import>` for format
    details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        classes (None): an optional string or list of strings specifying a
            subset of classes to load
        unlabeled ("_unlabeled"): the name of the subdirectory containing
            unlabeled images
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        classes=None,
        unlabeled="_unlabeled",
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        classes = _to_list(classes)

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.compute_metadata = compute_metadata
        self.classes = classes
        self.unlabeled = unlabeled

        self._classes = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        image_path, label = next(self._iter_samples)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        if label is not None:
            label = fol.Classification(label=label)

        return image_path, image_metadata, label

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def has_dataset_info(self):
        return True

    @property
    def label_cls(self):
        return fol.Classification

    def setup(self):
        samples = []
        classes = set()
        whitelist = set(self.classes) if self.classes is not None else None

        for relpath in etau.list_files(self.dataset_dir, recursive=True):
            chunks = relpath.split(os.path.sep, 1)
            if len(chunks) == 1:
                continue

            label = chunks[0]
            if label.startswith("."):
                continue

            if whitelist is not None and label not in whitelist:
                continue

            if label == self.unlabeled:
                label = None
            else:
                classes.add(label)

            path = os.path.join(self.dataset_dir, relpath)
            samples.append((path, label))

        samples = self._preprocess_list(samples)

        if whitelist is not None:
            classes = self.classes
        else:
            classes = sorted(classes)

        self._samples = samples
        self._num_samples = len(samples)
        self._classes = classes

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        return sorted(etau.list_subdirs(dataset_dir))

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(dataset_dir, recursive=True))


def _to_list(arg):
    if arg is None:
        return None

    if etau.is_container(arg):
        return list(arg)

    return [arg]


class VideoClassificationDirectoryTreeImporter(LabeledVideoDatasetImporter):
    """Importer for a viideo classification directory tree stored on disk.

    See :ref:`this page <VideoClassificationDirectoryTree-import>` for format
    details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        classes (None): an optional string or list of strings specifying a
            subset of classes to load
        unlabeled ("_unlabeled"): the name of the subdirectory containing
            unlabeled images
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        classes=None,
        unlabeled="_unlabeled",
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        classes = _to_list(classes)

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.compute_metadata = compute_metadata
        self.classes = classes
        self.unlabeled = unlabeled

        self._classes = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        video_path, label = next(self._iter_samples)

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        if label is not None:
            label = fol.Classification(label=label)

        return video_path, video_metadata, label, None

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def has_dataset_info(self):
        return True

    @property
    def label_cls(self):
        return fol.Classification

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        samples = []
        classes = set()
        whitelist = set(self.classes) if self.classes is not None else None

        for relpath in etau.list_files(self.dataset_dir, recursive=True):
            chunks = relpath.split(os.path.sep, 1)
            if len(chunks) == 1:
                continue

            label = chunks[0]
            if label.startswith("."):
                continue

            if whitelist is not None and label not in whitelist:
                continue

            if label == self.unlabeled:
                label = None
            else:
                classes.add(label)

            path = os.path.join(self.dataset_dir, relpath)
            samples.append((path, label))

        samples = self._preprocess_list(samples)

        if whitelist is not None:
            classes = self.classes
        else:
            classes = sorted(classes)

        self._samples = samples
        self._num_samples = len(samples)
        self._classes = classes

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        return sorted(etau.list_subdirs(dataset_dir))

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(dataset_dir, recursive=True))


class FiftyOneImageDetectionDatasetImporter(
    LabeledImageDatasetImporter, ImportPathsMixin
):
    """Importer for image detection datasets stored on disk in a simple JSON
    format.

    See :ref:`this page <FiftyOneImageDetectionDataset-import>` for format
    details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.compute_metadata = compute_metadata

        self._classes = None
        self._sample_parser = None
        self._image_paths_map = None
        self._labels_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None
        self._has_labels = False

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        image_path = self._image_paths_map[uuid]
        target = self._labels_map[uuid]

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        if self._has_labels:
            self._sample_parser.with_sample((image_path, target))
            label = self._sample_parser.get_label()
        else:
            label = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return self._classes is not None

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.Detections

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.read_json(self.labels_path)
            labels = {fou.normpath(k): v for k, v in labels.items()}
        else:
            labels = {}

        classes = labels.get("classes", None)
        labels_map = labels.get("labels", {})

        uuids = self._preprocess_list(sorted(labels_map.keys()))
        has_labels = any(labels_map.values())

        self._classes = classes
        self._has_labels = has_labels

        self._sample_parser = FiftyOneImageDetectionSampleParser()
        self._sample_parser.classes = classes

        self._image_paths_map = image_paths_map
        self._labels_map = labels_map
        self._uuids = uuids
        self._num_samples = len(uuids)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return labels.get("classes", None)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return len(labels.get("labels", {}))


class FiftyOneTemporalDetectionDatasetImporter(
    LabeledVideoDatasetImporter, ImportPathsMixin
):
    """Importer for temporal video detection datasets stored on disk in a
    simple JSON format.

    See :ref:`this page <FiftyOneTemporalDetectionDataset-import>` for format
    details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.json``
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.compute_metadata = compute_metadata

        self._video_paths_map = None
        self._labels_map = None
        self._uuids = None
        self._iter_uuids = None
        self._classes = None
        self._sample_parser = None
        self._num_samples = None
        self._has_labels = False

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        video_path = self._video_paths_map[uuid]
        labels = self._labels_map[uuid]

        if self.compute_metadata:
            video_metadata = self._sample_parser.get_video_metadata()
        else:
            video_metadata = None

        if self._has_labels:
            sample = (video_path, labels)
            self._sample_parser.with_sample(sample, metadata=video_metadata)
            label = self._sample_parser.get_label()
        else:
            label = None

        return video_path, video_metadata, label, None

    @property
    def has_dataset_info(self):
        return self._classes is not None

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.TemporalDetections

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            labels = etas.read_json(self.labels_path)
            labels = {fou.normpath(k): v for k, v in labels.items()}
        else:
            labels = {}

        classes = labels.get("classes", None)
        labels_map = labels.get("labels", {})
        has_labels = any(labels_map.values())

        uuids = sorted(labels_map.keys())
        uuids = self._preprocess_list(uuids)

        self._sample_parser = FiftyOneTemporalDetectionSampleParser()
        self._sample_parser.classes = classes

        self._classes = classes
        self._video_paths_map = video_paths_map
        self._labels_map = labels_map
        self._has_labels = has_labels
        self._uuids = uuids
        self._num_samples = len(uuids)

    def get_dataset_info(self):
        return {"classes": self._classes}

    @staticmethod
    def _get_classes(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return labels.get("classes", None)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        labels_path = os.path.join(dataset_dir, "labels.json")
        labels = etas.read_json(labels_path)
        return len(labels.get("labels", {}))


class ImageSegmentationDirectoryImporter(
    LabeledImageDatasetImporter, ImportPathsMixin
):
    """Importer for image segmentation datasets stored on disk.

    See :ref:`this page <ImageSegmentationDirectory-import>` for format
    details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data"/`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data
            -   a dict mapping filenames to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location of the labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels/``
        force_grayscale (False): whether to load RGB masks as grayscale by
            storing only the first channel
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with masks (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        compute_metadata=False,
        force_grayscale=False,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.force_grayscale = force_grayscale
        self.compute_metadata = compute_metadata
        self.include_all_data = include_all_data

        self._image_paths_map = None
        self._labels_paths_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        image_path = self._image_paths_map[uuid]
        mask_path = self._labels_paths_map.get(uuid, None)

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        if mask_path is not None:
            mask = _read_mask(mask_path, force_grayscale=self.force_grayscale)
            label = fol.Segmentation(mask=mask)
        else:
            label = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return fol.Segmentation

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        labels_path = fou.normpath(self.labels_path)
        labels_paths_map = {
            os.path.splitext(p)[0]: os.path.join(labels_path, p)
            for p in etau.list_files(labels_path, recursive=True)
        }

        uuids = set(labels_paths_map.keys())

        if self.include_all_data:
            uuids.update(image_paths_map.keys())

        uuids = self._preprocess_list(sorted(uuids))

        self._image_paths_map = image_paths_map
        self._labels_paths_map = labels_paths_map
        self._uuids = uuids
        self._num_samples = len(uuids)

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(etau.list_files(os.path.join(dataset_dir, "data")))


def _read_mask(mask_path, force_grayscale=False):
    # pylint: disable=no-member
    mask = etai.read(mask_path, cv2.IMREAD_UNCHANGED)
    if force_grayscale and mask.ndim > 1:
        mask = mask[:, :, 0]

    return mask


class FiftyOneImageLabelsDatasetImporter(LabeledImageDatasetImporter):
    """Importer for labeled image datasets whose labels are stored in
    `ETA ImageLabels format <https://github.com/voxel51/eta/blob/develop/docs/image_labels_guide.md>`_.

    See :ref:`this page <FiftyOneImageLabelsDataset-import>` for format
    details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.ImageMetadata` instances for each
            image when importing
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.compute_metadata = compute_metadata
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical

        self._description = None
        self._sample_parser = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        sample = next(self._iter_samples)

        self._sample_parser.with_sample(sample)
        image_path = self._sample_parser.get_image_path()
        label = self._sample_parser.get_label()

        if self.compute_metadata:
            image_metadata = fom.ImageMetadata.build_for(image_path)
        else:
            image_metadata = None

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return bool(self._description)

    @property
    def has_image_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return {
            "attributes": fol.Classifications,
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        sample_parser = FiftyOneImageLabelsSampleParser(
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )

        index = _load_labeled_dataset_index(self.dataset_dir)

        description = index.description
        inds = self._preprocess_list(list(range(len(index))))

        image_paths = []
        label_paths = []
        for idx in inds:
            record = index[idx]
            image_paths.append(
                fou.normpath(os.path.join(self.dataset_dir, record.data))
            )
            label_paths.append(
                fou.normpath(os.path.join(self.dataset_dir, record.labels))
            )

        samples = list(zip(image_paths, label_paths))

        self._sample_parser = sample_parser
        self._samples = samples
        self._num_samples = len(samples)
        self._description = description

    def get_dataset_info(self):
        return {"description": self._description}

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(_load_labeled_dataset_index(dataset_dir))


class FiftyOneVideoLabelsDatasetImporter(LabeledVideoDatasetImporter):
    """Importer for labeled video datasets whose labels are stored in
    `ETA VideoLabels format <https://github.com/voxel51/eta/blob/develop/docs/video_labels_guide.md>`_.

    See :ref:`this page <FiftyOneVideoLabelsDataset-import>` for format
    details.

    Args:
        dataset_dir: the dataset directory
        compute_metadata (False): whether to produce
            :class:`fiftyone.core.metadata.VideoMetadata` instances for each
            video when importing
        prefix (None): a string prefix to prepend to each label name in the
            expanded sample/frame label dictionaries
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the sample labels to field names into which to expand them. By
            default, all sample labels are loaded
        frame_labels_dict (None): a dictionary mapping names of
            attributes/objects in the frame labels to field names into which to
            expand them. By default, all frame labels are loaded
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        compute_metadata=False,
        prefix=None,
        labels_dict=None,
        frame_labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.compute_metadata = compute_metadata
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.frame_labels_dict = frame_labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical

        self._description = None
        self._sample_parser = None
        self._samples = None
        self._iter_samples = None
        self._num_samples = None

    def __iter__(self):
        self._iter_samples = iter(self._samples)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        sample = next(self._iter_samples)

        self._sample_parser.with_sample(sample)
        video_path = self._sample_parser.get_video_path()
        label = self._sample_parser.get_label()
        frames = self._sample_parser.get_frame_labels()

        if self.compute_metadata:
            video_metadata = fom.VideoMetadata.build_for(video_path)
        else:
            video_metadata = None

        return video_path, video_metadata, label, frames

    @property
    def has_dataset_info(self):
        return bool(self._description)

    @property
    def has_video_metadata(self):
        return self.compute_metadata

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return None

    def setup(self):
        sample_parser = FiftyOneVideoLabelsSampleParser(
            prefix=self.prefix,
            labels_dict=self.labels_dict,
            frame_labels_dict=self.frame_labels_dict,
            multilabel=self.multilabel,
            skip_non_categorical=self.skip_non_categorical,
        )

        index = _load_labeled_dataset_index(self.dataset_dir)

        description = index.description
        inds = self._preprocess_list(list(range(len(index))))

        video_paths = []
        label_paths = []
        for idx in inds:
            record = index[idx]
            video_paths.append(
                fou.normpath(os.path.join(self.dataset_dir, record.data))
            )
            label_paths.append(
                fou.normpath(os.path.join(self.dataset_dir, record.labels))
            )

        samples = list(zip(video_paths, label_paths))

        self._samples = samples
        self._sample_parser = sample_parser
        self._num_samples = len(samples)
        self._description = description

    def get_dataset_info(self):
        return {"description": self._description}

    @staticmethod
    def _get_num_samples(dataset_dir):
        # Used only by dataset zoo
        return len(_load_labeled_dataset_index(dataset_dir))


def _load_labeled_dataset_index(dataset_dir):
    index_path = os.path.join(dataset_dir, "manifest.json")
    d = etas.read_json(index_path)
    return etad.LabeledDatasetIndex.from_dict(d)
