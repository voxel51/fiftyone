"""
FiftyOne package namespace.

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

import fiftyone.core.config as foc
from fiftyone.core.dashboard import launch_dashboard
import fiftyone.core.service as fos

config = foc.load_config()
dataset_service = fos.DatabaseService()
server_service = fos.ServerService()

from .core.dataset import (
    Dataset,
    list_dataset_names,
    load_dataset,
)
from .core.labels import (
    ClassificationLabel,
    DetectionLabels,
    ImageLabels,
    Label,
)
from .core.sample import ImageSample, Sample
