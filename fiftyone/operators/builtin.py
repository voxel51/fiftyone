"""
Builtin operators.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import os

import fiftyone as fo
import fiftyone.core.storage as fos
import fiftyone.operators as foo
import fiftyone.operators.types as types


class CloneSelectedSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_selected_samples",
            label="Clone selected samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected)
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            inputs.str(
                "msg",
                label=f"Clone {count} selected {sample_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select samples to clone",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Clone selected samples")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        if not ctx.selected:
            return

        samples = ctx.dataset.select(ctx.selected)
        sample_ids = ctx.dataset.add_collection(samples, new_ids=True)

        ctx.trigger("clear_selected_samples")
        ctx.trigger("reload_samples")


class CloneSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clone_sample_field",
            label="Clone sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        field_name = ctx.params.get("field_name", None)
        new_field_name = ctx.params.get("new_field_name", None)
        inputs = types.Object()
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        has_valid_field_name = field_name in field_keys
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Choose a field",
            description=(
                "The field to copy. You can use dot notation "
                "(embedded.field.name) to clone embedded fields"
            ),
            view=field_selector,
            required=True,
        )
        if has_valid_field_name:
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New field",
                description=(
                    "The new field to create. You can use dot notation "
                    "(embedded.field.name) to create embedded fields"
                ),
                default=f"{field_name}_copy",
            )
            if new_field_name and new_field_name in field_keys:
                new_field_prop.invalid = True
                new_field_prop.error_message = (
                    f"Field '{new_field_name}' already exists"
                )
                inputs.str(
                    "error",
                    label="Error",
                    view=types.Error(
                        label="Field already exists",
                        description=f"Field '{new_field_name}' already exists",
                    ),
                )

        return types.Property(
            inputs, view=types.View(label="Clone sample field")
        )

    def execute(self, ctx):
        ctx.dataset.clone_sample_field(
            ctx.params.get("field_name", None),
            ctx.params.get("new_field_name", None),
        )
        ctx.trigger("reload_dataset")


class RenameSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="rename_sample_field",
            label="Rename sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Field to rename",
            view=field_selector,
            required=True,
        )
        field_name = ctx.params.get("field_name", None)
        new_field_name = ctx.params.get("new_field_name", None)
        if field_name and field_name in field_keys:
            new_field_prop = inputs.str(
                "new_field_name",
                required=True,
                label="New field name",
                default=f"{field_name}_copy",
            )
            if new_field_name and new_field_name in field_keys:
                new_field_prop.invalid = True
                new_field_prop.error_message = (
                    f"Field '{new_field_name}' already exists"
                )
                inputs.str(
                    "error",
                    label="Error",
                    view=types.Error(
                        label="Field already exists",
                        description=f"Field '{new_field_name}' already exists",
                    ),
                )

        return types.Property(
            inputs, view=types.View(label="Rename sample field")
        )

    def execute(self, ctx):
        ctx.dataset.rename_sample_field(
            ctx.params.get("field_name", None),
            ctx.params.get("new_field_name", None),
        )
        ctx.trigger("reload_dataset")


class ClearSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="clear_sample_field",
            label="Clear sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Field to clear",
            view=field_selector,
            required=True,
        )

        return types.Property(
            inputs, view=types.View(label="Clear sample field")
        )

    def execute(self, ctx):
        ctx.dataset.clear_sample_field(ctx.params.get("field_name", None))
        ctx.trigger("reload_dataset")


class DeleteSelectedSamples(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_selected_samples",
            label="Delete selected samples",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected)
        if count > 0:
            sample_text = "sample" if count == 1 else "samples"
            inputs.str(
                "msg",
                label=f"Delete {count} selected {sample_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select samples to delete",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Delete selected samples")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        num_samples = len(ctx.selected)
        if num_samples == 0:
            return

        ctx.dataset.delete_samples(ctx.selected)

        ctx.trigger("clear_selected_samples")
        ctx.trigger("reload_samples")


class DeleteSelectedLabels(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_selected_labels",
            label="Delete selected labels",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()

        count = len(ctx.selected_labels)
        if count > 0:
            label_text = "label" if count == 1 else "labels"
            inputs.str(
                "msg",
                label=f"Delete {count} selected {label_text}?",
                view=types.Warning(),
            )
        else:
            prop = inputs.str(
                "msg",
                label="You must select labels to delete",
                view=types.Warning(),
            )
            prop.invalid = True

        view = types.View(label="Delete selected labels")
        return types.Property(inputs, view=view)

    def execute(self, ctx):
        if not ctx.selected_labels:
            return

        ctx.dataset.delete_labels(labels=ctx.selected_labels)

        ctx.trigger("clear_selected_labels")
        ctx.trigger("reload_dataset")


class DeleteSampleField(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_sample_field",
            label="Delete sample field",
            dynamic=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        fields = ctx.dataset.get_field_schema(flat=True)
        field_keys = list(fields.keys())
        field_selector = types.AutocompleteView()
        for key in field_keys:
            field_selector.add_choice(key, label=key)

        inputs.enum(
            "field_name",
            field_keys,
            label="Field to delete",
            view=field_selector,
            required=True,
        )

        return types.Property(
            inputs, view=types.View(label="Delete sample field")
        )

    def execute(self, ctx):
        ctx.dataset.delete_sample_field(ctx.params.get("field_name", None))
        ctx.trigger("reload_dataset")


class PrintStdout(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="print_stdout",
            label="Print to stdout",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("msg", label="Message", required=True)
        return types.Property(inputs, view=types.View(label="Print to stdout"))

    def execute(self, ctx):
        print(ctx.params.get("msg", None))
        return {"msg": ctx.params.get("msg", None)}


class ListFiles(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_files",
            label="List Files",
            unlisted=True,
        )

    def execute(self, ctx):
        path = ctx.params.get("path", None)
        list_filesystems = ctx.params.get("list_filesystems", False)
        if list_filesystems:
            return {"filesystems": list_fileystems()}

        if path:
            try:
                return {"files": list_files(path)}
            except Exception as e:
                return {"files": [], "error": str(e)}


def get_default_path_for_filesystem(fs):
    if fs == fos.FileSystem.LOCAL:
        HOME = os.environ.get("HOME", None)
        return os.environ.get("FIFTYONE_DEFAULT_LOCAL_PATH", HOME)
    else:
        raise ValueError("Unsupported file system '%s'" % fs)


def list_fileystems():
    filesystems = fos.list_available_file_systems()
    results = []
    for fs in fos.FileSystem:
        if fs in filesystems:
            results.append(
                {
                    "name": fs.name,
                    "default_path": get_default_path_for_filesystem(fs),
                }
            )
    return results


def list_files(dirpath):
    dirs = [
        {
            "name": name,
            "type": "directory",
            "absolute_path": fos.join(dirpath, name),
        }
        for name in fos.list_subdirs(dirpath)
    ]
    files = [
        {
            "name": d["name"],
            "date_modified": d["last_modified"].isoformat(),
            "type": "file",
            "size": d["size"],
            "absolute_path": fos.join(dirpath, d["name"]),
        }
        for d in fos.list_files(dirpath, return_metadata=True)
    ]
    return dirs + files


class ListWorkspaces(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="list_workspaces", label="List Workspaces", unlisted=True
        )

    def execute(self, ctx):
        return {"workspaces": ctx.dataset.list_workspaces(info=True)}


class LoadWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="load_workspace",
            label="Load Workspace",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("name", label="Workspace Name", required=True)
        return types.Property(inputs)

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        ctx.ops.set_spaces(name=name)
        return {}


class SaveWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="save_workspace",
            label="Save Workspace",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("name", label="Workspace Name", required=True)
        inputs.str("description", label="Description")
        inputs.str("color", label="Color")
        inputs.obj("spaces", label="Spaces")
        inputs.bool("edit", label="Edit")
        if ctx.params.get("edit", False):
            inputs.str(
                "current_name", label="Current Workspace Name", required=True
            )
        return types.Property(inputs)

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        description = ctx.params.get("description", None)
        color = ctx.params.get("color", None)
        spaces_dict = ctx.params.get("spaces", None)
        spaces = fo.Space.from_dict(spaces_dict)
        edit = ctx.params.get("edit", False)
        current_name = ctx.params.get("current_name", None)
        if edit:
            ctx.dataset.update_workspace_info(
                current_name,
                info=dict(name=name, color=color, description=description),
            )
        else:
            ctx.dataset.save_workspace(
                name, spaces, description=description, color=color
            )
        return {}


class DeleteWorkspace(foo.Operator):
    @property
    def config(self):
        return foo.OperatorConfig(
            name="delete_workspace",
            label="Delete Workspace",
            unlisted=True,
        )

    def resolve_input(self, ctx):
        inputs = types.Object()
        inputs.str("name", label="Workspace Name", required=True)
        return types.Property(inputs)

    def execute(self, ctx):
        name = ctx.params.get("name", None)
        ctx.dataset.delete_workspace(name)
        return {}


BUILTIN_OPERATORS = [
    CloneSelectedSamples(_builtin=True),
    CloneSampleField(_builtin=True),
    RenameSampleField(_builtin=True),
    ClearSampleField(_builtin=True),
    DeleteSelectedSamples(_builtin=True),
    DeleteSelectedLabels(_builtin=True),
    DeleteSampleField(_builtin=True),
    PrintStdout(_builtin=True),
    ListFiles(_builtin=True),
    ListWorkspaces(_builtin=True),
    LoadWorkspace(_builtin=True),
    SaveWorkspace(_builtin=True),
    DeleteWorkspace(_builtin=True),
]
