"""
FiftyOne Data Lens utilities.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses


def filter_fields_for_type(data: dict, data_type) -> dict:
    """Filter a dict to only include the fields defined in the provided data type.

    Args:
        data (dict): The data to filter.
        data_type (Class): The ``dataclasses.dataclass`` type defining the available fields.

    Returns:
        dict: A dict containing only the keys defined in the provided data type.
    """
    fields = dataclasses.fields(data_type)

    return {
        key: data.get(key)
        for key in (field.name for field in fields)
        if key in data
    }