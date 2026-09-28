"""
Exact episode and segment membership shared by selections and saved subsets.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
import json

from bson import ObjectId

import fiftyone.core.selection_refs as fosr


def normalize_members(members):
    """Validates and deduplicates members without merging overlapping ranges.

    Bounds are decimal integers on a named native timebase. Frame events use
    zero-based, half-open sequence bounds; nanosecond sources retain their
    exact integer precision. Stream sets are resolved before capture.

    Args:
        members: an iterable of episode/segment dictionaries

    Returns:
        the normalized members, with combined provenance for duplicates
    """
    result = {}
    for original in members:
        if not isinstance(original, dict):
            raise ValueError("A selection member must be an object")
        member = copy.deepcopy(original)
        episode_id = member.get("episodeId")
        if not ObjectId.is_valid(episode_id):
            raise ValueError("A member requires a valid parent episode ID")
        member["episodeId"] = str(ObjectId(episode_id))
        kind = member.get("kind")
        if kind == "episode":
            member = {"episodeId": member["episodeId"], "kind": kind}
            if "reference" in original:
                member["reference"] = fosr.normalize_reference(
                    original["reference"]
                )
        elif kind == "segment":
            bounds = member.get("range")
            if not isinstance(bounds, dict) or not all(
                key in bounds for key in ("start", "end", "streams")
            ):
                raise ValueError("Segments require bounds and streams")
            start = _integer(bounds["start"])
            end = _integer(bounds["end"])
            streams = bounds["streams"]
            if (
                start >= end
                or not isinstance(bounds.get("timebase"), str)
                or not bounds["timebase"]
                or not isinstance(streams, list)
                or not streams
                or not all(isinstance(s, str) and s for s in streams)
            ):
                raise ValueError(
                    "Segments require ordered bounds, timebase, and streams"
                )
            provenance = bounds.get("provenance", [])
            if not isinstance(provenance, list) or not all(
                isinstance(p, dict)
                and isinstance(p.get("provider"), str)
                and isinstance(p.get("source"), str)
                for p in provenance
            ):
                raise ValueError("Invalid segment provenance")
            member = {
                "episodeId": member["episodeId"],
                "kind": kind,
                "range": {
                    "start": str(start),
                    "end": str(end),
                    "timebase": bounds["timebase"],
                    "streams": sorted(set(streams)),
                    "provenance": provenance,
                },
            }
        else:
            raise ValueError("Unknown member kind: %r" % kind)

        key = member_key(member)
        previous = result.get(key)
        if kind == "segment":
            sources = previous["range"]["provenance"] if previous else []
            sources += member["range"]["provenance"]
            member["range"]["provenance"] = list(
                {json.dumps(p, sort_keys=True): p for p in sources}.values()
            )
        result[key] = member

    return list(result.values())


def member_key(member):
    """Returns a canonical identity excluding provenance and dataset scope.

    Storage always pairs this identity with a dataset ID and subset ID.
    """
    if member.get("reference") is not None:
        return json.dumps(
            ["reference", fosr.normalize_reference(member["reference"])],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )
    key = [member["episodeId"], member["kind"]]
    if member["kind"] == "segment":
        bounds = member["range"]
        key += [
            bounds["timebase"],
            str(_integer(bounds["start"])),
            str(_integer(bounds["end"])),
            sorted(set(bounds["streams"])),
        ]
    return json.dumps(key, separators=(",", ":"), ensure_ascii=False)


def intersect_members(candidates, allowed):
    """Clips candidates to an explicit subset boundary on time and streams.

    Whole-episode membership admits either scope. Segment-only membership
    cannot admit a full-episode candidate. Distinct saved intervals remain
    distinct even when overlapping.
    """
    by_episode = {}
    for member in allowed:
        by_episode.setdefault(member["episodeId"], []).append(member)
    result = []
    for candidate in candidates:
        permitted = by_episode.get(candidate["episodeId"], [])
        if any(m["kind"] == "episode" for m in permitted):
            result.append(candidate)
            continue
        if candidate["kind"] != "segment":
            continue
        bounds = candidate["range"]
        for member in permitted:
            saved = member["range"]
            if bounds["timebase"] != saved["timebase"]:
                continue
            start = max(int(bounds["start"]), int(saved["start"]))
            end = min(int(bounds["end"]), int(saved["end"]))
            streams = sorted(set(bounds["streams"]) & set(saved["streams"]))
            if start < end and streams:
                clipped = copy.deepcopy(candidate)
                clipped["range"].update(
                    start=str(start),
                    end=str(end),
                    streams=streams,
                    provenance=copy.deepcopy(
                        saved.get("provenance", [])
                        + bounds.get("provenance", [])
                    ),
                )
                result.append(clipped)
    return normalize_members(result)


def select_parents(collection, ids):
    """Selects parents by id, reaching into every slice of a grouped dataset."""
    import fiftyone.core.view as fov

    ids = list(ids)
    if collection.media_type == "group":
        return fov.make_optimized_select_view(collection, ids, flatten=True)
    return collection.select(ids)


def group_members(members, samples=None):
    """Groups stored members without changing full/segment coexistence."""
    groups = {}
    for member in normalize_members(members):
        episode_id = member["episodeId"]
        group = groups.setdefault(
            episode_id, {"episodeId": episode_id, "members": []}
        )
        group["members"].append(member)
    if samples is not None:
        for episode_id, group in groups.items():
            sample = samples.get(episode_id)
            group["unavailable"] = sample is None
            if sample is not None:
                group.update(sample)
    return list(groups.values())


def count_members(members, unavailable_ids=()):
    """Counts parent episodes separately from full-episode and segment units."""
    members = normalize_members(members)
    unavailable_ids = set(unavailable_ids)
    return {
        "episodes": len({m["episodeId"] for m in members}),
        "fullEpisodes": sum(m["kind"] == "episode" for m in members),
        "segments": sum(m["kind"] == "segment" for m in members),
        "segmentEpisodes": len(
            {m["episodeId"] for m in members if m["kind"] == "segment"}
        ),
        "unavailable": sum(m["episodeId"] in unavailable_ids for m in members),
    }


def _integer(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("Bounds must be exact decimal integers")
    if isinstance(value, str) and not value.lstrip("-").isdigit():
        raise ValueError("Bounds must be exact decimal integers")
    return int(value)
