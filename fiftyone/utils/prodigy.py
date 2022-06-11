"""
Utilities for working with datasets in
`Prodigy format <https://prodi.gy>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import copy, deepcopy
from datetime import datetime
import itertools
import logging
import multiprocessing
import multiprocessing.dummy
import os
import warnings
import webbrowser

from bson import ObjectId
import jinja2
import numpy as np
import requests
import urllib3

import eta.core.data as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua
import fiftyone.utils.data as foud
import fiftyone.utils.video as fouv


logger = logging.getLogger(__name__)


class ProdigyBackend(foua.AnnotationBackend):
    """Backend for the Prodigy integration."""

    pass


class ProdigyBackendConfig(foua.AnnotationAPI):
    """Configuration for the Prodigy backend."""

    pass


class ProdigyAnnotationResults(foua.AnnotationResults):
    """Results from the Prodigy backend."""

    pass
