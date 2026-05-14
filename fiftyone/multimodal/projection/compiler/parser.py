"""
YAML manifest parser.

Reads a manifest YAML string and returns a raw dict that mirrors the
top-level structure. Does not expand templates or resolve references —
those are handled by subsequent compiler phases.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations

try:
    import yaml
except ImportError:
    raise ImportError(
        "PyYAML is required for manifest parsing. "
        "Install it via:\n\n    pip install pyyaml\n"
    )

_TOP_LEVEL_KEYS = frozenset(
    {
        "channel_bindings",
        "channel_binding_repeats",
        "logical_streams",
        "logical_stream_repeats",
        "projections",
    }
)

_VALID_GRAINS = frozenset(
    {
        "observation",
        "signal_chunk",
        "annotation",
        "segment",
        "scene_summary",
    }
)


class ManifestParseError(ValueError):
    pass


def parse_manifest(yaml_source: str) -> dict:
    """Parse a manifest YAML string into a raw validated dict.

    Validates top-level structure and that each projection declares exactly
    one grain key. Does not expand templates or resolve cross-references.

    Args:
        yaml_source: raw YAML string

    Returns:
        dict with keys: channel_bindings, channel_binding_repeats,
        logical_streams, logical_stream_repeats, projections (all lists,
        defaulting to empty if absent)

    Raises:
        ManifestParseError: on structural problems
    """
    try:
        raw = yaml.safe_load(yaml_source)
    except yaml.YAMLError as exc:
        raise ManifestParseError(f"Invalid YAML: {exc}") from exc

    if not isinstance(raw, dict):
        raise ManifestParseError(
            "Manifest must be a YAML mapping at the top level"
        )

    unknown = set(raw) - _TOP_LEVEL_KEYS
    if unknown:
        raise ManifestParseError(f"Unknown top-level keys: {sorted(unknown)}")

    manifest = {
        "channel_bindings": _require_list(raw, "channel_bindings"),
        "channel_binding_repeats": _require_list(
            raw, "channel_binding_repeats"
        ),
        "logical_streams": _require_list(raw, "logical_streams"),
        "logical_stream_repeats": _require_list(raw, "logical_stream_repeats"),
        "projections": _require_list(raw, "projections"),
    }

    _validate_channel_bindings(
        manifest["channel_bindings"], label="channel_bindings"
    )
    for repeat in manifest["channel_binding_repeats"]:
        _validate_repeat_block(repeat, "channel_binding_repeats")
        _validate_channel_bindings(
            repeat.get("templates", []),
            label="channel_binding_repeats.templates",
        )

    _validate_logical_streams(
        manifest["logical_streams"], label="logical_streams"
    )
    for repeat in manifest["logical_stream_repeats"]:
        _validate_repeat_block(repeat, "logical_stream_repeats")
        _validate_logical_streams(
            repeat.get("templates", []),
            label="logical_stream_repeats.templates",
        )

    _validate_projections(manifest["projections"])

    return manifest


# ---------------------------------------------------------------------------
# Internal validators
# ---------------------------------------------------------------------------


def _require_list(raw: dict, key: str) -> list:
    val = raw.get(key, [])
    if val is None:
        return []
    if not isinstance(val, list):
        raise ManifestParseError(
            f"'{key}' must be a list, got {type(val).__name__}"
        )
    return val


def _require_str_field(obj: dict, field: str, parent: str) -> str:
    val = obj.get(field)
    if not isinstance(val, str) or not val.strip():
        raise ManifestParseError(
            f"'{parent}' entry missing required string field '{field}'"
        )
    return val


def _validate_channel_bindings(bindings: list, label: str) -> None:
    for i, b in enumerate(bindings):
        if not isinstance(b, dict):
            raise ManifestParseError(f"{label}[{i}] must be a mapping")
        _require_str_field(b, "id", f"{label}[{i}]")
        if "match" in b and not isinstance(b["match"], dict):
            raise ManifestParseError(f"{label}[{i}].match must be a mapping")


def _validate_logical_streams(streams: list, label: str) -> None:
    for i, s in enumerate(streams):
        if not isinstance(s, dict):
            raise ManifestParseError(f"{label}[{i}] must be a mapping")
        _require_str_field(s, "id", f"{label}[{i}]")
        kind = s.get("kind")
        if kind is not None and kind not in ("bundle", "virtual"):
            raise ManifestParseError(
                f"{label}[{i}].kind must be 'bundle' or 'virtual', got {kind!r}"
            )


def _validate_repeat_block(repeat: dict, label: str) -> None:
    if not isinstance(repeat, dict):
        raise ManifestParseError(f"{label} entry must be a mapping")
    if not isinstance(repeat.get("var"), str):
        raise ManifestParseError(f"{label} entry missing string 'var'")
    if not isinstance(repeat.get("values"), list):
        raise ManifestParseError(f"{label} entry missing list 'values'")
    if not isinstance(repeat.get("templates"), list):
        raise ManifestParseError(f"{label} entry missing list 'templates'")


def _validate_projections(projections: list) -> None:
    for i, proj in enumerate(projections):
        if not isinstance(proj, dict):
            raise ManifestParseError(f"projections[{i}] must be a mapping")
        _require_str_field(proj, "id", f"projections[{i}]")
        grains = _VALID_GRAINS & set(proj)
        if len(grains) == 0:
            raise ManifestParseError(
                f"projections[{i}] (id={proj.get('id')!r}) must declare exactly one "
                f"grain key: {sorted(_VALID_GRAINS)}"
            )
        if len(grains) > 1:
            raise ManifestParseError(
                f"projections[{i}] (id={proj.get('id')!r}) declares multiple grain "
                f"keys: {sorted(grains)}"
            )
