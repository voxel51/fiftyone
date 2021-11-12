"""
FiftyOne server media handling.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from tornado.web import HTTPError

from fiftyone.core.cache import media_cache

import fiftyone.server.base as fosb


class MediaHandler(fosb.FileHandler):
    """Media server for serving local or cached media files"""

    @classmethod
    def get_absolute_path(cls, root, path):
        if path in media_cache:
            path = media_cache.get_local_path(path)
        elif os.name != "nt":
            path = os.path.join("/", path)
            path = media_cache.get_local_path(path)

        return path

    def validate_absolute_path(self, root, absolute_path):
        if os.path.isdir(absolute_path) and self.default_filename is not None:
            if not self.request.path.endswith("/"):
                self.redirect(self.request.path + "/", permanent=True)
                return None

            absolute_path = os.path.join(absolute_path, self.default_filename)
        if not os.path.exists(absolute_path):
            raise HTTPError(404)

        if not os.path.isfile(absolute_path):
            raise HTTPError(403, "%s is not a file", self.path)

        return absolute_path
