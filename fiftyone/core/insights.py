"""
Core definitions of insights stored in FiftyOne dataset samples.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import eta.core.serial as etas
import eta.core.utils as etau


class Insight(etas.Serializable):
    """An insight in a :class:`fiftyone.core.dataset.Dataset`.

    Insight instances represent features of the elements of a sample, such as
    metadata about the raw data sample or attributes of the sample's labels.

    Args:
        group (None): the group name of the insight
    """

    def __init__(self, group=None):
        self._group = group

    @property
    def type(self):
        """The fully-qualified class name of the label."""
        return etau.get_class_name(self)

    @property
    def group(self):
        """The group name of the insight, or ``None`` if it is not associated
        with a label group.
        """
        return self._group

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return ["type", "group"]

    @classmethod
    def from_dict(cls, d):
        """Constructs an `class`:Insight` from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            an `class`:Insight`
        """
        insight_cls = etau.get_class(d["type"])
        return insight_cls._from_dict(d, group=d["group"])

    @classmethod
    def _from_dict(cls, d, **kwargs):
        """Internal implementation of :func:`Insight.from_dict`.

        Subclasses should implement this method, not :func:`Insight.from_dict`.

        Args:
            d: a JSON dictionary
            **kwargs: keyword arguments for :class:`Insight` that have already
                been parsed by :func:`Insight.from_dict`

        Returns:
            an `class`:Insight`
        """
        raise NotImplementedError("Subclass must implement _from_dict()")


class FileHashInsight(Insight):
    """An insight that stores the file hash of the raw data associated with a
    sample in a dataset.

    Args:
        file_hash: the file hash of the raw data
        **kwargs: keyword arguments for :class:`Insight`
    """

    def __init__(self, file_hash, **kwargs):
        super(FileHashInsight, self).__init__(**kwargs)
        self.file_hash = file_hash

    def attributes(self):
        """Returns the list of class attributes to be serialized.

        Returns:
            a list of class attributes
        """
        return super(FileHashInsight, self).attributes() + ["file_hash"]

    @classmethod
    def _from_dict(cls, d, **kwargs):
        return cls(d["file_hash"], **kwargs)
