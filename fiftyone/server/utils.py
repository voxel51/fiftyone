"""
FiftyOne Server utils.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import typing as t

import cachetools
from dacite import Config, from_dict as _from_dict
from dacite.core import T
from dacite.data import Data

import fiftyone.core.dataset as fod
import fiftyone.core.fields as fof


_cache = cachetools.TTLCache(maxsize=10, ttl=900)  # ttl in seconds
_dacite_config = Config(check_types=False)


def load_and_cache_dataset(name):
    """Loads the dataset with the given name and caches it.

    This method is a wrapper around :func:`fiftyone.core.dataset.load_dataset`
    that stores a reference to every dataset it loads in a TTL cache to ensure
    that references to recently used datasets exist in memory so that dataset
    objects aren't garbage collected between async calls.

    It is desirable to avoid dataset objects being garbage collected because
    datasets are singletons and may have objects (eg brain results) that are
    expensive to load cached on them.

    Args:
        name: the dataset name

    Returns:
        a :class:`fiftyone.core.dataset.Dataset`
    """
    dataset = fod.load_dataset(name)

    # Store reference in TTL cache to defer garbage collection
    # IMPORTANT: we don't return already cached objects here because a dataset
    # can be deleted and another created with the same name
    _cache[name] = dataset

    return dataset


def cache_dataset(dataset):
    """Caches the given dataset.

    This method ensures that subsequent calls to
    :func:`fiftyone.core.dataset.load_dataset` in async calls will return this
    dataset singleton.

    See :meth:`load_and_cache_dataset` for additional details.

    Args:
        dataset: a :class:`fiftyone.core.dataset.Dataset`
    """
    _cache[dataset.name] = dataset


def change_sample_tags(sample_collection, changes):
    """Applies the changes to tags to all samples of the collection, if
    necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all samples, if necessary. A ``False`` value
            removes the tag from all samples, if necessary
    """
    add_tags, del_tags = _parse_changes(changes)

    if add_tags:
        sample_collection.tag_samples(add_tags)

    if del_tags:
        sample_collection.untag_samples(del_tags)


def change_label_tags(sample_collection, changes, label_fields=None):
    """Applies the changes to tags to all labels in the specified label
    field(s) of the collection, if necessary.

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        changes: a dict of tags as keys and bools as values. A ``True`` value
            adds the tag to all labels, if necessary. A ``False`` value removes
            the tag from all labels, if necessary
        label_fields (None): an optional name or iterable of names of
            :class:`fiftyone.core.labels.Label` fields. By default, all label
            fields are used
    """
    add_tags, del_tags = _parse_changes(changes)

    if add_tags:
        sample_collection.tag_labels(add_tags, label_fields=label_fields)

    if del_tags:
        sample_collection.untag_labels(del_tags, label_fields=label_fields)


def from_dict(data_class: t.Type[T], data: Data) -> T:
    """Wrapping function for ``dacite.from_dict`` that ensures a common
    configuration is used.

    Args:
        data_class: a dataclass
        data: the data with which to instantiate the dataclass instance

    Returns:
        a dataclass instance
    """
    return _from_dict(data_class, data, config=_dacite_config)


def meets_type(field: fof.Field, type_or_types):
    """
    Determines whether the field meets type or types, or the field
    is a :class:`fiftyone.core.fields.ListField` that meets the type or types

    Args:
        field: a class:`fiftyone.core.fields.Field`
        type: a field type or `tuple` of field types
    """
    return isinstance(field, type_or_types) or (
        isinstance(field, fof.ListField)
        and isinstance(field.field, type_or_types)
    )


def _parse_changes(changes):
    add_tags = []
    del_tags = []
    for tag, add in changes.items():
        if add:
            add_tags.append(tag)
        else:
            del_tags.append(tag)

    return add_tags, del_tags
