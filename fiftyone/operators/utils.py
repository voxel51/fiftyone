"""
FiftyOne operator utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from datetime import datetime
import logging

import fiftyone as fo
import fiftyone.operators.types as types


class ProgressHandler(logging.Handler):
    """A logging handler that reports all logging messages issued while the
    handler's context manager is active to the provided execution context's
    :meth:`set_progress() <fiftyone.operators.executor.ExecutionContext.set_progress>`
    method.

    Args:
        ctx: an :class:`fiftyone.operators.executor.ExecutionContext`
        logger (None): a specific ``logging.Logger`` for which to report
            records. By default, the root logger is used
        level (None): an optional logging level above which to report records.
            By default, the logger's effective level is used
    """

    def __init__(self, ctx, logger=None, level=None):
        super().__init__()
        self.ctx = ctx
        self.logger = logger
        self.level = level

    def __enter__(self):
        if self.logger is None:
            self.logger = logging.getLogger()

        if self.level is None:
            self.level = self.logger.getEffectiveLevel()

        self.setLevel(self.level)
        self.logger.addHandler(self)

    def __exit__(self, *args):
        try:
            self.logger.removeHandler(self)
        except:
            pass

    def emit(self, record):
        msg = self.format(record)
        self.ctx.set_progress(label=msg)


def is_method_overridden(base_class, sub_class_instance, method_name):
    """Returns whether a method is overridden in a subclass.

    Args:
        base_class: the base class
        sub_class_instance: an instance of the subclass
        method_name: the name of the method

    Returns:
        True/False
    """

    base_method = getattr(base_class, method_name, None)
    sub_method = getattr(type(sub_class_instance), method_name, None)
    return base_method != sub_method


def create_summary_field_inputs(ctx, inputs):
    schema = ctx.dataset.get_field_schema(flat=True)
    if ctx.dataset._has_frame_fields():
        frame_schema = ctx.dataset.get_frame_field_schema(flat=True)
        schema.update(
            {
                ctx.dataset._FRAMES_PREFIX + path: field
                for path, field in frame_schema.items()
            }
        )

    categorical_field_types = (fo.StringField, fo.BooleanField)
    numeric_field_types = (
        fo.FloatField,
        fo.IntField,
        fo.DateField,
        fo.DateTimeField,
    )

    schema = {
        p: f
        for p, f in schema.items()
        if (
            isinstance(f, categorical_field_types)
            or isinstance(f, numeric_field_types)
        )
    }

    path_keys = list(schema.keys())
    path_selector = types.AutocompleteView()
    for key in path_keys:
        path_selector.add_choice(key, label=key)

    inputs.enum(
        "path",
        path_selector.values(),
        label="Input field",
        description="The input field to summarize",
        view=path_selector,
        required=True,
    )

    path = ctx.params.get("path", None)
    if path is None or path not in path_keys:
        return

    field_name = ctx.params.get("field_name", None)
    if field_name is None:
        default_field_name = ctx.dataset._get_default_summary_field_name(path)
    else:
        default_field_name = field_name

    field_name_prop = inputs.str(
        "field_name",
        required=False,
        label="Summary field",
        description="The sample field in which to store the summary data",
        default=default_field_name,
    )

    if field_name and field_name in path_keys:
        field_name_prop.invalid = True
        field_name_prop.error_message = f"Field '{field_name}' already exists"
        inputs.str(
            "error",
            label="Error",
            view=types.Error(
                label="Field already exists",
                description=f"Field '{field_name}' already exists",
            ),
        )
        return

    if ctx.dataset.app_config.sidebar_groups is not None:
        sidebar_group_selector = types.AutocompleteView()
        for group in ctx.dataset.app_config.sidebar_groups:
            sidebar_group_selector.add_choice(group.name, label=group.name)
    else:
        sidebar_group_selector = None

    inputs.str(
        "sidebar_group",
        default="summaries",
        required=False,
        label="Sidebar group",
        description=(
            "The name of an "
            "[App sidebar group](https://docs.voxel51.com/user_guide/app.html#sidebar-groups) "
            "to which to add the summary field"
        ),
        view=sidebar_group_selector,
    )

    field = schema.get(path, None)
    if isinstance(field, categorical_field_types):
        inputs.bool(
            "include_counts",
            label="Include counts",
            description=(
                "Whether to include per-value counts when summarizing the "
                "categorical field"
            ),
            default=False,
        )
    elif isinstance(field, numeric_field_types):
        group_prefix = path.rsplit(".", 1)[0] + "."
        group_by_keys = sorted(p for p in schema if p.startswith(group_prefix))
        group_by_selector = types.AutocompleteView()
        for group in group_by_keys:
            group_by_selector.add_choice(group, label=group)

        inputs.enum(
            "group_by",
            group_by_selector.values(),
            default=None,
            required=False,
            label="Group by",
            description=(
                "An optional attribute to group by when to generate "
                "per-attribute `[min, max]` ranges"
            ),
            view=group_by_selector,
        )

    inputs.bool(
        "read_only",
        default=True,
        required=False,
        label="Read-only",
        description="Whether to mark the summary field as read-only",
    )

    inputs.bool(
        "create_index",
        default=True,
        required=False,
        label="Create index",
        description=(
            "Whether to create database index(es) for the summary field"
        ),
    )


def is_new(release_date, days=30):
    """
    Determines if a feature is considered "new" based on its release date.

    A feature is considered new if its release date is within the specified number of days.

    Args:
        release_date (str or datetime): The release date of the feature.
            - If a string, it should be in the format "%Y-%m-%d" (e.g., "2024-11-09").
            - If a datetime object, it will be used directly without conversion.
        days (int, optional): The number of days within which the feature is considered new.
            Defaults to 30.

    Returns:
        bool: True if the release date is within the specified number of days, False otherwise.

    Examples:
        >>> is_new("2024-11-09")  # Using a string date and default days
        True  # if today's date is within 30 days after 2024-11-09

        >>> is_new(datetime(2024, 11, 9), days=15)  # Using a datetime object with 15-day threshold
        True  # if today's date is within 15 days after November 9, 2024

        >>> is_new("2024-10-01", days=45)
        False  # if today's date is more than 45 days after October 1, 2024
    """
    if isinstance(release_date, str):
        release_date = datetime.strptime(release_date, "%Y-%m-%d")
    elif not isinstance(release_date, datetime):
        raise ValueError("release_date must be a string or datetime object")

    return (datetime.now() - release_date).days <= days
