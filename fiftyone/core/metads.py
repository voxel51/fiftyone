"""
FiftyOne meta-datasets.

The MetaDataset is a database collection used to keep track of all persistent
datasets. Also relevant without persistence for actions like:

        list_dataset_names()


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

import logging

logger = logging.getLogger(__name__)


# @todo(Tyler) for reconstructing ODMSample subclasses from the DB
class MetaDataset:
    pass
