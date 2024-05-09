"""
FiftyOne operator execution.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json

from bson import json_util


class Operations(object):
    """Interface to trigger builtin operations on an execution context.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
    """

    def __init__(self, ctx):
        self._ctx = ctx

    ###########################################################################
    # Builtin Python operators
    ###########################################################################

    def clone_selected_samples(self):
        """Clone the selected samples in the App."""
        return self._ctx.trigger("clone_selected_samples")

    def clone_sample_field(self, field_name, new_field_name):
        """Clone a sample field to a new field name.

        Args:
            field_name: the name of the field to clone
            new_field_name: the name for the new field
        """
        return self._ctx.trigger(
            "clone_sample_field",
            params={
                "field_name": field_name,
                "new_field_name": new_field_name,
            },
        )

    def rename_sample_field(self, field_name, new_field_name):
        """Rename a sample field to a new field name.

        Args:
            field_name: the name of the field to rename
            new_field_name: the new name for the field
        """
        return self._ctx.trigger(
            "rename_sample_field",
            params={
                "field_name": field_name,
                "new_field_name": new_field_name,
            },
        )

    def clear_sample_field(self, field_name):
        """Clear the contents of a sample field.

        Args:
            field_name: the name of the field to clear
        """
        return self._ctx.trigger(
            "clear_sample_field",
            params={"field_name": field_name},
        )

    def delete_selected_samples(self):
        """Delete the selected samples in the App."""
        return self._ctx.trigger("delete_selected_samples")

    def delete_selected_labels(self):
        """Delete the selected labels in the App."""
        return self._ctx.trigger("delete_selected_labels")

    def delete_sample_field(self, field_name):
        """Delete a sample field.

        Args:
            field_name: the name of the field to delete
        """
        return self._ctx.trigger(
            "delete_sample_field",
            params={"field_name": field_name},
        )

    def print_stdout(self, message):
        """Print a message to the standard output.

        Args:
            message: the message to print
        """
        return self._ctx.trigger("print_stdout", params={"msg": message})

    def list_files(self, path=None, list_filesystems=False):
        """List files in a directory or list filesystems.

        Args:
            path (None): the path to list files from, or None to list
                filesystems
            list_filesystems (False): whether to list filesystems instead of
                files
        """
        return self._ctx.trigger(
            "list_files",
            params={"path": path, "list_filesystems": list_filesystems},
        )

    ###########################################################################
    # Builtin JS operators
    ###########################################################################

    def reload_samples(self):
        """Reload the sample grid in the App."""
        return self._ctx.trigger("reload_samples")

    def reload_dataset(self):
        """Reload the dataset in the App."""
        return self._ctx.trigger("reload_dataset")

    def clear_selected_samples(self):
        """Clear selected samples in the App."""
        return self._ctx.trigger("clear_selected_samples")

    def copy_view_as_json(self):
        """Copy the current view in the App as JSON."""
        return self._ctx.trigger("copy_view_as_json")

    def view_from_json(self):
        """Set the view in the App from JSON present in clipboard."""
        return self._ctx.trigger("view_from_clipboard")

    def open_panel(self, name, is_active=True, layout=None):
        """Open a panel with the given name and layout options in the App.

        Args:
            name: the name of the panel to open
            is_active (True): whether to activate the panel immediately
            layout (None): the layout orientation
                ``("horizontal", "vertical")``, if applicable
        """
        params = {"name": name, "isActive": is_active}
        if layout is not None:
            params["layout"] = layout

        return self._ctx.trigger("open_panel", params=params)

    def open_all_panels(self):
        """Open all available panels in the App."""
        return self._ctx.trigger("open_all_panel")

    def close_panel(self, name):
        """Close the panel with the given name in the App.

        Args:
            name: the name of the panel to close
        """
        return self._ctx.trigger("close_panel", params={"name": name})

    def close_all_panels(self):
        """Close all open panels in the App."""
        return self._ctx.trigger("close_all_panel")

    def split_panel(self, name, layout):
        """Split the panel with the given layout in the App.

        Args:
            name: the name of the panel to split
            layout: the layout orientation ``("horizontal", "vertical")``
        """
        return self._ctx.trigger(
            "split_panel", params={"name": name, "layout": layout}
        )

    def open_dataset(self, dataset_name):
        """Open the specified dataset in the App.

        Args:
            dataset_name: the name of the dataset to open
        """
        return self._ctx.trigger(
            "open_dataset", params={"dataset": dataset_name}
        )

    def clear_view(self):
        """Clear the view bar in the App."""
        return self._ctx.trigger("clear_view")

    def clear_sidebar_filters(self):
        """Clear all filters in the App's sidebar."""
        return self._ctx.trigger("clear_sidebar_filters")

    def clear_all_stages(self):
        """Clear all selections, filters, and view stages from the App."""
        return self._ctx.trigger("clear_all_stages")

    def refresh_colors(self):
        """Refresh the colors used in the App's UI."""
        return self._ctx.trigger("refresh_colors")

    def show_selected_samples(self):
        """Show the samples that are currently selected in the App."""
        return self._ctx.trigger("show_selected_samples")

    def convert_extended_selection_to_selected_samples(self):
        """Convert the extended selection to selected samples in the App."""
        return self._ctx.trigger(
            "convert_extended_selection_to_selected_samples"
        )

    def set_selected_samples(self, samples):
        """Select the specified samples in the App.

        Args:
            samples: a list of sample IDs to select
        """
        return self._ctx.trigger(
            "set_selected_samples", params={"samples": samples}
        )

    def set_view(self, view=None, name=None):
        """Set the current view in the App.

        Args:
            view (None): a :class:`fiftyone.core.view.DatasetView` to load
            name (None): the name of a saved view to load
        """
        params = {}
        if view is not None:
            params["view"] = _serialize_view(view)

        if name is not None:
            params["name"] = name

        return self._ctx.trigger("set_view", params=params)

    def show_samples(self, samples, use_extended_selection=False):
        """Show specific samples, optionally using extended selection in the
        App.

        Args:
            samples: a list of sample IDs to show
            use_extended_selection (False): whether to use the extended
                selection feature
        """
        params = {
            "samples": samples,
            "use_extended_selection": use_extended_selection,
        }
        return self._ctx.trigger("show_samples", params=params)

    def console_log(self, message):
        """Log a message to the console.

        Args:
            message: the message to log
        """
        return self._ctx.trigger("console_log", params={"message": message})

    def show_output(self, outputs, results):
        """Show output in the App's UI.

        Args:
            outputs: outputs to show
            results: results to display
        """
        return self._ctx.trigger(
            "show_output", params={"outputs": outputs, "results": results}
        )

    def set_progress(self, label=None, progress=None, variant=None):
        """Set the progress indicator in the App's UI.

        Args:
            label (None): a label for the progress indicator
            progress (None): a progress value to set
            variant (None): the type of indicator ``("linear", "circular")``
        """
        params = {}
        if label is not None:
            params["label"] = label
        if progress is not None:
            params["progress"] = progress
        if variant is not None:
            params["variant"] = variant

        return self._ctx.trigger("set_progress", params=params)

    def test_operator(self, operator, raw_params):
        """Test the operator with given parameters.

        Args:
            operator: the operator to test
            raw_params: raw parameters for the operator
        """
        return self._ctx.trigger(
            "test_operator",
            params={"operator": operator, "raw_params": raw_params},
        )

    def set_selected_labels(self, labels):
        """Set the selected labels in the App.

        Args:
            labels: the labels to select
        """
        return self._ctx.trigger(
            "set_selected_labels", params={"labels": labels}
        )

    def clear_selected_labels(self):
        """Clear the selected labels in the App."""
        return self._ctx.trigger("clear_selected_labels")

    def set_spaces(self, spaces=None, name=None):
        """Set space in the App by name or :class:`fiftyone.core.odm.workspace.Space`.

        Args:
            spaces: the spaces (:class:`fiftyone.core.odm.workspace.Space`) to load
            name: the name of the workspace to load
        """
        params = {}
        if spaces is not None:
            params["spaces"] = spaces.to_dict()
        elif name is not None:
            params["spaces"] = self._ctx.dataset.load_workspace(name).to_dict()

        return self._ctx.trigger("set_spaces", params=params)


def _serialize_view(view):
    return json.loads(json_util.dumps(view._serialize()))
