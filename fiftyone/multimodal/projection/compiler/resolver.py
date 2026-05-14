"""
Reference resolver and manifest validator.

Operates on an expanded manifest (all templates already applied) and verifies:
  - All channel binding IDs are unique
  - All logical stream IDs are unique
  - All projection IDs are unique
  - Every source reference in logical streams and projections points to a
    declared channel binding, logical stream, or projection ID

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from __future__ import annotations


class ManifestResolveError(ValueError):
    pass


def resolve_manifest(expanded: dict) -> dict:
    """Validate all cross-references in an expanded manifest.

    Args:
        expanded: output of :func:`~.expander.expand_manifest`

    Returns:
        the same dict unchanged (validated in place)

    Raises:
        ManifestResolveError: on any unknown reference or duplicate ID
    """
    binding_ids = _collect_ids(
        expanded.get("channel_bindings", []), "channel_bindings"
    )
    stream_ids = _collect_ids(
        expanded.get("logical_streams", []), "logical_streams"
    )
    projection_ids = _collect_ids(
        expanded.get("projections", []), "projections"
    )

    for stream in expanded.get("logical_streams", []):
        _resolve_stream_refs(stream, binding_ids, stream_ids)

    for proj in expanded.get("projections", []):
        _resolve_projection_refs(proj, binding_ids, stream_ids, projection_ids)

    return expanded


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _collect_ids(entries: list[dict], label: str) -> set[str]:
    seen: set[str] = set()
    for entry in entries:
        eid = entry.get("id")
        if eid is None:
            raise ManifestResolveError(
                f"{label} entry is missing an 'id' field"
            )
        if eid in seen:
            raise ManifestResolveError(f"Duplicate id {eid!r} in {label}")
        seen.add(eid)
    return seen


def _resolve_stream_refs(
    stream: dict,
    binding_ids: set[str],
    stream_ids: set[str],
) -> None:
    sid = stream.get("id")
    kind = stream.get("kind", "bundle")

    for comp in stream.get("components", []):
        source = comp.get("source", {})
        if cb := source.get("channel_binding"):
            _assert_exists(
                cb, binding_ids, f"logical_stream '{sid}' component source"
            )
        if ls := source.get("logical_stream"):
            _assert_exists(
                ls, stream_ids, f"logical_stream '{sid}' component source"
            )

    if kind == "virtual":
        for src in stream.get("sources", []):
            if cb := src.get("channel_binding"):
                _assert_exists(
                    cb, binding_ids, f"logical_stream '{sid}' virtual source"
                )
            if ls := src.get("logical_stream"):
                _assert_exists(
                    ls, stream_ids, f"logical_stream '{sid}' virtual source"
                )


def _resolve_projection_refs(
    proj: dict,
    binding_ids: set[str],
    stream_ids: set[str],
    projection_ids: set[str],
) -> None:
    pid = proj.get("id")

    for source in proj.get("sources", []):
        for cb in source.get("channel_bindings", []):
            _assert_exists(cb, binding_ids, f"projection '{pid}' source")
        for ls in source.get("logical_streams", []):
            _assert_exists(ls, stream_ids, f"projection '{pid}' source")
        for up in source.get("projections", []):
            _assert_exists(up, projection_ids, f"projection '{pid}' source")
            if up == pid:
                raise ManifestResolveError(
                    f"Projection '{pid}' references itself as a source"
                )


def _assert_exists(ref_id: str, id_set: set[str], context: str) -> None:
    if ref_id not in id_set:
        raise ManifestResolveError(
            f"{context} references unknown id '{ref_id}'"
        )
