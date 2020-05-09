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

import fiftyone.core.document as fod
import fiftyone.core.odm as foo


class Insight(fod.BackedByDocument):
    """Base class for insights attached to :class:`fiftyone.core.sample.Sample`
    instances in a :class:`fiftyone.core.dataset.Dataset`.

    Insights may represent simple features on the sample such as the file hash
    or the image brightness, or more complex concepts like "difficulty of
    classification" or "mislabel probability". They can be anything from a
    single scalar, string or vector to a much more complicated
    data structure.

    Each concrete :class:`Insight` subclass supports a specific value type:

        - :class:`IntInsight`: integer insights
        - :class:`ScalarInsight`: numeric scalar insights
        - :class:`StringInsight`: string insights
        - :class:`DictInsight`: arbitrary JSON-serializable dict insights
    """

    _ODM_DOCUMENT_CLS = foo.ODMInsight

    @property
    def value(self):
        """The insight value."""
        return self._backing_doc.value

    @classmethod
    def create(cls, value):
        """Creates a :class:`Insight` instance.

        Args:
            value: the value of the insight
        """
        return cls._create(value=value)

    @classmethod
    def from_doc(cls, document):
        """Creates an instance of the :class:`Insight`
        class backed by the given document.

        Args:
            document: an :class:`fiftyone.core.odm.ODMInsight` instance
        """
        insight_cls = _INSIGHT_CLS_MAP[document.__class__]
        return insight_cls(document)


class IntInsight(Insight):
    """An integer insight."""

    _ODM_DOCUMENT_CLS = foo.ODMIntInsight


class ScalarInsight(Insight):
    """A numeric scalar insight."""

    _ODM_DOCUMENT_CLS = foo.ODMScalarInsight


class StringInsight(Insight):
    """A string insight."""

    _ODM_DOCUMENT_CLS = foo.ODMStringInsight


class DictInsight(Insight):
    """An arbitrary JSON-serializable dictionary insight."""

    _ODM_DOCUMENT_CLS = foo.ODMDictInsight


_INSIGHT_CLS_MAP = {
    foo.ODMInsight: Insight,
    foo.ODMIntInsight: IntInsight,
    foo.ODMScalarInsight: ScalarInsight,
    foo.ODMStringInsight: StringInsight,
    foo.ODMDictInsight: DictInsight,
}
