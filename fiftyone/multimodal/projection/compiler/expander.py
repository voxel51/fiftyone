"""
Template expander for channel_binding_repeats and logical_stream_repeats.

Expands repeat blocks into flat lists of bindings/streams using
{{var.field}} interpolation. After expansion the manifest contains only
`channel_bindings` and `logical_streams` (the repeat keys are removed).

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

import copy
import re

_TEMPLATE_RE = re.compile(r"\{\{(\w+)\.(\w+)\}\}")


class TemplateExpansionError(ValueError):
    pass


def expand_manifest(manifest: dict) -> dict:
    """Expand all repeat blocks into flat binding/stream lists.

    Args:
        manifest: raw manifest dict from :func:`~.parser.parse_manifest`

    Returns:
        new dict with ``channel_binding_repeats`` and
        ``logical_stream_repeats`` removed and their expansions merged into
        ``channel_bindings`` and ``logical_streams``

    Raises:
        TemplateExpansionError: on duplicate IDs after expansion or bad templates
    """
    channel_bindings = list(manifest.get("channel_bindings", []))
    logical_streams = list(manifest.get("logical_streams", []))

    for repeat in manifest.get("channel_binding_repeats", []):
        channel_bindings.extend(_expand_repeat(repeat))

    for repeat in manifest.get("logical_stream_repeats", []):
        logical_streams.extend(_expand_repeat(repeat))

    _assert_unique_ids(channel_bindings, "channel_bindings")
    _assert_unique_ids(logical_streams, "logical_streams")

    return {
        "channel_bindings": channel_bindings,
        "logical_streams": logical_streams,
        "projections": manifest.get("projections", []),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _expand_repeat(repeat: dict) -> list[dict]:
    """Expand one repeat block into a flat list of concrete entries."""
    var_name: str = repeat["var"]
    values: list[dict] = repeat["values"]
    templates: list[dict] = repeat["templates"]

    expanded = []
    for value_record in values:
        if not isinstance(value_record, dict):
            raise TemplateExpansionError(
                f"Each entry in repeat 'values' must be a mapping, got {type(value_record).__name__}"
            )
        scope = {var_name: value_record}
        for template in templates:
            expanded.append(_interpolate(copy.deepcopy(template), scope))
    return expanded


def _interpolate(obj: object, scope: dict[str, dict]) -> object:
    """Recursively interpolate {{var.field}} placeholders in all string values."""
    if isinstance(obj, str):
        return _interpolate_str(obj, scope)
    if isinstance(obj, dict):
        return {k: _interpolate(v, scope) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_interpolate(item, scope) for item in obj]
    return obj


def _interpolate_str(s: str, scope: dict[str, dict]) -> str:
    def replace(match: re.Match) -> str:
        var, attr = match.group(1), match.group(2)
        if var not in scope:
            raise TemplateExpansionError(
                f"Template references unknown variable '{{{{{{var}}}}}}'; "
                f"available: {list(scope)}"
            )
        record = scope[var]
        if attr not in record:
            raise TemplateExpansionError(
                f"Template variable '{var}' has no field '{attr}'; "
                f"available fields: {list(record)}"
            )
        return str(record[attr])

    return _TEMPLATE_RE.sub(replace, s)


def _assert_unique_ids(entries: list[dict], label: str) -> None:
    seen: set[str] = set()
    for entry in entries:
        eid = entry.get("id")
        if eid in seen:
            raise TemplateExpansionError(
                f"Duplicate id {eid!r} in {label} after template expansion"
            )
        if eid is not None:
            seen.add(eid)
