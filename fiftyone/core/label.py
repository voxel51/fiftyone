"""
Core Module for `fiftyone` Sample class

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
import eta.core.labels as etal
import eta.core.serial as etas


class Label(etas.Serializable):
    def __init__(self, group):
        self.group = group

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a Label from a JSON dictionary.

        Args:
            d: a JSON dictionary
            **kwargs: keyword arguments that have already been parsed by a
            subclass

        Returns:
            a Label
        """
        group = d["group"]

        return cls(group=group, **kwargs)


class ClassificationLabel(Label):
    def __init__(self, label, confidence=None, *args, **kwargs):
        super(ClassificationLabel, self).__init__(*args, **kwargs)
        self.label = label
        self.confidence = confidence

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a ClassificationLabel from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a ClassificationLabel
        """
        label = d["label"]

        confidence = d.get("confidence", None)

        return super(ClassificationLabel, cls).from_dict(
            d, label=label, confidence=confidence
        )


class LabelSet(etal.LabelsSet):
    _ELE_ATTR = "labels"
    _ELE_KEY_ATTR = "group"

    # @todo(Tyler) temp because etas.Set doesn't support element subclasses
    # _ELE_CLS = Label
    _ELE_CLS = ClassificationLabel

    _ELE_CLS_FIELD = "_LABELS_CLS"
