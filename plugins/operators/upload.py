"""
Upload files operator.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import fiftyone.operators as foo
import fiftyone.operators.types as types

DEFAULT_DESTINATION = "/tmp"


class UploadFiles(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="upload_files",
            label="Upload files",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        file_explorer = types.FileExplorerView(
            choose_dir=True,
            button_label="Choose a destination...",
            choose_button_label="Select Upload Directory",
        )
        inputs.file(
            "destination",
            default={"absolute_path": DEFAULT_DESTINATION},
            label="Destination",
            description="Choose the upload directory",
            view=file_explorer,
        )

        destination = (
            ctx.params.get("destination", {}).get("absolute_path")
            or DEFAULT_DESTINATION
        )

        inputs.uploads(
            "files",
            destination=destination,
            label="Files",
            description="Choose files to upload",
        )

        return types.Property(inputs, view=types.View(label="Upload files"))

    def resolve_output(self, ctx):
        outputs = types.Object()
        outputs.list(
            "uploaded",
            types.File(),
            label="Uploaded files",
        )
        return types.Property(outputs)

    def execute(self, ctx):
        files = ctx.params.get("files", [])
        return {"uploaded": files}
