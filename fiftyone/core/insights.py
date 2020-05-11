"""
Insights stored in dataset samples.

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

import fiftyone.core.document as fod
import fiftyone.core.odm as foo


class Insight(fod.BackedByDocument):
    """An insight for a :class:`fiftyone.core.sample.Sample` in a
    :class:`fiftyone.core.dataset.Dataset`.

    Insight instances may represent simple features on the sample such as
    the file hash or the image brightness, or more complex concepts like
    "difficulty of classification" or "mislabel probability". They can be
    anything from a single scalar, string or vector to a much more complicated
    data structure.
    """

    _ODM_DOCUMENT_CLS = foo.ODMInsight

    @classmethod
    def create(cls):
        """Creates a :class:`Insight` instance."""
        return cls._create()

    @classmethod
    def from_doc(cls, document):
        """Creates an instance of the :class:`Insight`
        class backed by the given document.

        Args:
            document: an :class:`fiftyone.core.odm.ODMInsight` instance
        """
        insight_cls = _INSIGHT_CLS_MAP[document.__class__]
        return insight_cls(document)


class ScalarInsight(Insight):
    """An insight that stores a numerical scalar value and a name associated
    with it.
    """

    _ODM_DOCUMENT_CLS = foo.ODMScalarInsight

    @property
    def name(self):
        """The name describing the insight."""
        return self._backing_doc.name

    @property
    def scalar(self):
        """The scalar value in the insight."""
        return self._backing_doc.scalar

    @classmethod
    def create(cls, name, scalar):
        """Creates a :class:`ScalarInsight` instance.

        Args:
            name: string describing the insight
            scalar: the real-valued scalar insight

        Returns:
            a :class:`ScalarInsight`
        """
        return cls._create(name=name, scalar=scalar)


class FileHashInsight(Insight):
    """An insight that stores the file hash of the raw data associated with a
    sample in a dataset.
    """

    _ODM_DOCUMENT_CLS = foo.ODMFileHashInsight

    @property
    def file_hash(self):
        """The integer file hash."""
        return self._backing_doc.file_hash

    @classmethod
    def create(cls, file_hash):
        """Creates a :class:`FileHashInsight` instance.

        Args:
            file_hash: the integer file hash

        Returns:
            a :class:`FileHashInsight`
        """
        return cls._create(file_hash=file_hash)


_INSIGHT_CLS_MAP = {
    foo.ODMInsight: Insight,
    foo.ODMScalarInsight: ScalarInsight,
    foo.ODMFileHashInsight: FileHashInsight,
}
