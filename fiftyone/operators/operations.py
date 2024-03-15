import json
from bson import json_util


class Operations(object):
    def __init__(self, ctx):
        """
        Initialize the Operations class with a :class:`fiftyone.operators.ExecutionContext`.

        Args:
            ctx: The :class:`fiftyone.operators.ExecutionContext` to use.
        """
        self._ctx = ctx

    #
    # Python Operators
    #

    def clone_selected_samples(self):
        """
        Clone the selected samples in the FiftyOne App.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger("clone_selected_samples")

    def clone_sample_field(self, field_name, new_field_name):
        """
        Clone a sample field to a new field name.

        Args:
            field_name: The name of the field to clone.
            new_field_name: The name for the new field.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "clone_sample_field",
            params={
                "field_name": field_name,
                "new_field_name": new_field_name,
            },
        )

    def rename_sample_field(self, field_name, new_field_name):
        """
        Rename a sample field to a new field name.

        Args:
            field_name: The current name of the field.
            new_field_name: The new name for the field.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "rename_sample_field",
            params={
                "field_name": field_name,
                "new_field_name": new_field_name,
            },
        )

    def clear_sample_field(self, field_name):
        """
        Clear the contents of a sample field.

        Args:
            field_name: The name of the field to clear.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "clear_sample_field",
            params={"field_name": field_name},
        )

    def delete_selected_samples(self):
        """
        Delete the selected samples in the FiftyOne App.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger("delete_selected_samples")

    def delete_selected_labels(self):
        """
        Delete the selected labels in the FiftyOne App.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger("delete_selected_labels")

    def delete_sample_field(self, field_name):
        """
        Delete a sample field.

        Args:
            field_name: The name of the field to delete.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "delete_sample_field",
            params={"field_name": field_name},
        )

    def print_stdout(self, message):
        """
        Print a message to the standard output.

        Args:
            message: The message to print.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "print_stdout",
            params={"msg": message},
        )

    def list_files(self, path=None, list_filesystems=False):
        """
        List files in a directory or list filesystems.

        Args:
            path: The path to list files from, or None to list filesystems.
            list_filesystems: Boolean indicating whether to list filesystems instead of files.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "list_files",
            params={"path": path, "list_filesystems": list_filesystems},
        )

    #
    # JS Operators
    #

    def reload_samples(self):
        """
        Reload samples from the dataset.
        """
        return self._ctx.trigger("reload_samples")

    def reload_dataset(self):
        """
        Reload the entire dataset.
        """
        return self._ctx.trigger("reload_dataset")

    def clear_selected_samples(self):
        """
        Clear selected samples.
        """
        return self._ctx.trigger("clear_selected_samples")

    def copy_view_as_json(self):
        """
        Copy the current view as JSON.
        """
        return self._ctx.trigger("copy_view_as_json")

    def view_from_json(self):
        """
        Set the view from JSON present in clipboard.
        """
        return self._ctx.trigger("view_from_clipboard")

    def open_panel(self, name, is_active=True, layout=None):
        """
        Open a panel with the given name and layout options.

        Args:
            name: Name of the panel to open.
            is_active: Whether to activate the panel immediately.
            layout: The layout orientation, if applicable.
        """
        params = {"name": name, "isActive": is_active}
        if layout:
            params["layout"] = layout
        return self._ctx.trigger("open_panel", params=params)

    def open_all_panels(self):
        """
        Open all available panels.
        """
        return self._ctx.trigger("open_all_panel")

    def close_panel(self, name):
        """
        Close the panel with the given name.

        Args:
            name: Name of the panel to close.
        """
        return self._ctx.trigger("close_panel", params={"name": name})

    def close_all_panels(self):
        """
        Close all opened panels.
        """
        return self._ctx.trigger("close_all_panel")

    def split_panel(self, name, layout):
        """
        Split the panel with the given layout.

        Args:
            name: Name of the panel to split.
            layout: Layout type ('horizontal' or 'vertical').
        """
        return self._ctx.trigger(
            "split_panel", params={"name": name, "layout": layout}
        )

    def open_dataset(self, dataset_name):
        """
        Open the specified dataset.

        Args:
            dataset_name: Name of the dataset to open.
        """
        return self._ctx.trigger(
            "open_dataset", params={"dataset": dataset_name}
        )

    def clear_view(self):
        """
        Clear the view bar.
        """
        return self._ctx.trigger("clear_view")

    def clear_sidebar_filters(self):
        """
        Clear all filters in the sidebar.
        """
        return self._ctx.trigger("clear_sidebar_filters")

    def clear_all_stages(self):
        """
        Clear all selections, filters, and view stages.
        """
        return self._ctx.trigger("clear_all_stages")

    def refresh_colors(self):
        """
        Refresh the colors used in the app's UI.
        """
        return self._ctx.trigger("refresh_colors")

    def show_selected_samples(self):
        """
        Show the samples that are currently selected.
        """
        return self._ctx.trigger("show_selected_samples")

    def convert_extended_selection_to_selected_samples(self):
        """
        Convert the extended selection to the selected samples list.
        """
        return self._ctx.trigger(
            "convert_extended_selection_to_selected_samples"
        )

    def set_selected_samples(self, samples):
        """
        Set the specified samples as selected.

        Args:
            samples: A list of sample IDs to select.
        """
        return self._ctx.trigger(
            "set_selected_samples", params={"samples": samples}
        )

    def set_view(self, view):
        """
        Set the view of the FiftyOne App.

        Args:
            view: The `fiftyone.View` to set.

        Returns:
            The :class:`fiftyone.operators.message.GeneratedMessage` object
        """
        return self._ctx.trigger(
            "set_view",
            params=dict(view=_serialize_view(view)),
        )

    def show_samples(self, samples, use_extended_selection=False):
        """
        Show specific samples, optionally using extended selection.

        Args:
            samples: A list of sample IDs to show.
            use_extended_selection: Whether to use the extended selection feature.
        """
        params = {
            "samples": samples,
            "use_extended_selection": use_extended_selection,
        }
        return self._ctx.trigger("show_samples", params=params)

    def console_log(self, message):
        """
        Log a message to the console.

        Args:
            message: The message to log.
        """
        return self._ctx.trigger("console_log", params={"message": message})

    def show_output(self, outputs, results):
        """
        Show output in the app's UI.

        Args:
            outputs: Outputs to show.
            results: Results to display.
        """
        return self._ctx.trigger(
            "show_output", params={"outputs": outputs, "results": results}
        )

    def set_progress(self, label, variant, progress):
        """
        Set the progress indicator in the app's UI.

        Args:
            label: Label for the progress indicator.
            variant: Type of progress indicator ('linear' or 'circular').
            progress: Progress value to set.
        """
        return self._ctx.trigger(
            "set_progress",
            params={"label": label, "variant": variant, "progress": progress},
        )

    def test_operator(self, operator, raw_params):
        """
        Test an operator with given parameters.

        Args:
            operator: The operator to test.
            raw_params: Raw parameters for the operator.
        """
        return self._ctx.trigger(
            "test_operator",
            params={"operator": operator, "raw_params": raw_params},
        )

    def set_selected_labels(self, labels):
        """
        Set the selected labels in the UI.

        Args:
            labels: Labels to select.
        """
        return self._ctx.trigger(
            "set_selected_labels", params={"labels": labels}
        )

    def clear_selected_labels(self):
        """
        Clear the selected labels.
        """
        return self._ctx.trigger("clear_selected_labels")


def _serialize_view(view):
    """
    Serialize a FiftyOne View for transmission.

    Args:
        view: The FiftyOne View to serialize.

    Returns:
        A JSON representation of the view.
    """
    return json.loads(json_util.dumps(view._serialize()))
