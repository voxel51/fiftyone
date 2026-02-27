"""
FiftyOne upload-related operator types.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from .types import View


class UploadView(View):
    """Displays a file upload zone that streams files to the server.

    Uploaded files are represented as :class:`File` objects containing
    ``absolute_path``, ``name``, ``type``, and ``size``.

    Use the :meth:`Object.uploads` convenience method to define an upload
    property in a single line::

        inputs.uploads("files", destination="/my/upload/dir")

    Examples::

        import fiftyone.operators.types as types

        inputs = types.Object()

        # Simple upload
        inputs.uploads("files", destination="/data/uploads")

        # With constraints
        inputs.uploads(
            "images",
            destination="/data/images",
            accept=["image/*"],
            max_size=10_000_000,
            max_files=5,
        )

        # Using the view directly
        upload_view = types.UploadView(
            destination="/data/uploads",
            accept=[".csv", ".json"],
            max_files=10,
            label="Upload data files",
        )
        inputs.define_property(
            "data_files",
            types.List(types.File()),
            view=upload_view,
        )

    Args:
        destination: the server directory to upload files into. Must be
            within the configured ``browser_file_operations_dir``
        accept (None): list of accepted file types, as MIME types
            (e.g. ``"image/*"``) or extensions (e.g. ``".csv"``)
        max_size (None): maximum file size in bytes
        max_files (None): maximum number of files
        max_concurrent (None): maximum number of concurrent uploads
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.destination = kwargs.get("destination")
        self.accept = kwargs.get("accept", None)
        self.max_size = kwargs.get("max_size", None)
        self.max_files = kwargs.get("max_files", None)
        self.max_concurrent = kwargs.get("max_concurrent", None)
