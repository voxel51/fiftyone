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
    """Backend for the Prodigy integration.

    This class implements the logic required for your annotation backend to
    declare the types of labeling tasks that it supports, as well as the core
    upload_annotations() and download_annotations() methods, which handle
    uploading and downloading data and labels to your annotation tool.
    """

    pass


class ProdigyBackendConfig(foua.AnnotationAPI):
    """Configuration for the Prodigy backend.

    This class defines the available parameters that users can pass as keyword
    arguments to annotate() to customize the behavior of the annotation run.
    """

    pass


class ProdigyAnnotationResults(foua.AnnotationResults):
    """Results from the Prodigy backend.

    This class stores any intermediate information necessary to track the
    progress of an annotation run that has been created and is now waiting for
    its results to be merged back into the FiftyOne dataset.
    """

    pass
