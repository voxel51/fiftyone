"""
HTTP utils

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Any


class ETag:
    """Utility class for creating and parsing ETag strings."""

    @staticmethod
    def create(value: Any) -> str:
        """Creates an ETag string from the given value."""
        return f'"{value}"'

    @staticmethod
    def parse(etag: str) -> tuple[str, bool]:
        """Parses an ETag string into its value and whether it is weak."""

        is_weak = False
        if etag.startswith("W/"):
            is_weak = True
            etag = etag[2:]  # Remove "W/" prefix

        # Remove surrounding quotes (ETags are typically quoted)
        if etag.startswith('"') and etag.endswith('"'):
            etag = etag[1:-1]

        return etag, is_weak
