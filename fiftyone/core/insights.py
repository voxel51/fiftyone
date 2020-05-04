"""
Core Module for `fiftyone` Insight class

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


class Insight(etas.Serializable):
    # @todo(Tyler) this could all be deleted but I'll probably use it for
    # some other common field that all insights need to have
    def __init__(self, group=None):
        self._group = group

    @property
    def group(self):
        # @todo(Tyler) this needs to be accessed from the sample
        raise NotImplementedError("TODO")

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
        group = d.get("group", None)

        return cls(group=group, **kwargs)


class FileHashInsight(Insight):
    def __init__(self, file_hash, *args, **kwargs):
        super(FileHashInsight, self).__init__(*args, **kwargs)
        self.file_hash = file_hash

    @classmethod
    def from_dict(cls, d, **kwargs):
        """Constructs a FileHashInsight from a JSON dictionary.

        Args:
            d: a JSON dictionary

        Returns:
            a FileHashInsight
        """
        file_hash = d["file_hash"]

        return super(FileHashInsight, cls).from_dict(d, file_hash=file_hash)
