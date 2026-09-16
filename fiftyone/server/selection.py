"""
Resolution of complete grid selection scopes, independent of pagination.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
from datetime import datetime, timedelta, timezone

from bson import ObjectId

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.odm as foo
import fiftyone.core.selection as fosel
import fiftyone.core.stages as fosg
import fiftyone.core.storage as fost
import fiftyone.core.subsets as fosub
import fiftyone.core.tags as fot
from fiftyone.server.filters import GroupElementFilter, SampleFilter
import fiftyone.server.tags as fostag
import fiftyone.server.view as fosv

SNAPSHOT_TTL = timedelta(hours=1)
SNAPSHOT_CHUNK = 5000
GROUP_BY_STAGE = "fiftyone.core.stages.GroupBy"


def _flatten_dynamic_groups(stages):
    """Serialized stages with every dynamic GroupBy made flat."""
    result = []
    for stage in stages or []:
        if isinstance(stage, dict) and stage.get("_cls") == GROUP_BY_STAGE:
            stage = copy.deepcopy(stage)
            kwargs = dict(stage.get("kwargs") or [])
            kwargs["flat"] = True
            stage["kwargs"] = [list(item) for item in kwargs.items()]
        result.append(stage)
    return result


def _scoped_view(dataset, request, flat=False):
    """Builds the view the grid shows: stages, filters, and the active slice.

    Returns the view, the browsing boundary, and whether the view converts
    samples into other elements (patches, frames, clips).
    """
    boundary = request.get("boundary") or {}
    filters = copy.deepcopy(request.get("filters") or {})
    if boundary.get("subsetId"):
        filters["_selection_scope"] = boundary
    stages = request.get("view")
    if flat:
        stages = _flatten_dynamic_groups(stages)
    slice_name = request.get("slice")
    sample_filter = (
        SampleFilter(
            group=GroupElementFilter(slice=slice_name, slices=[slice_name])
        )
        if slice_name
        else None
    )
    view = fosv.get_view(
        dataset,
        stages=stages,
        filters=filters,
        extended_stages=copy.deepcopy(request.get("extendedStages") or {}),
        sample_filter=sample_filter,
        sort_by=request.get("sortBy"),
        desc=request.get("desc", False),
    )
    converted = view._dataset is not dataset
    if converted and (boundary.get("subsetId") or boundary.get("provider")):
        # Patches, frames, and clips views regenerate their own ids, so they
        # select their own elements; subsets and segment sources stay in the
        # samples view.
        raise ValueError(
            "Saved subsets and segment sources are available in the "
            "samples view"
        )
    return view, boundary, converted


def _dynamic_group_stage(view):
    for stage in view._stages:
        if isinstance(stage, fosg.GroupBy) and not stage.flat:
            return stage
    return None


def _expands_groups(request, boundary, group_stage):
    return (
        group_stage is not None
        and request.get("expand") == "dynamic-groups"
        and not boundary.get("provider")
        and not boundary.get("subsetId")
    )


def _constrained(request, boundary):
    return bool(
        request.get("view")
        or request.get("filters")
        or request.get("extendedStages")
        or boundary.get("provider")
    )


def _missing_subset_members(dataset, boundary):
    """Saved references whose parent no longer exists."""
    allowed = subset_boundary(dataset, boundary)
    present = set(
        fosel.select_parents(
            dataset, {m["episodeId"] for m in allowed}
        ).values("id")
    )
    return [m for m in allowed if m["episodeId"] not in present]


def _scope_members(dataset, view, boundary, converted, request):
    """Enumerates the complete scope server-side. Never sent to the browser."""
    if converted:
        return candidate_members(view), []
    group_stage = _dynamic_group_stage(view)
    if _expands_groups(request, boundary, group_stage):
        flat, _, _ = _scoped_view(dataset, request, flat=True)
        return candidate_members(flat), []
    members = scoped_members(view, boundary)
    missing = []
    if boundary.get("subsetId"):
        missing = _missing_subset_members(dataset, boundary)
        # Missing parents cannot be evaluated against live criteria. Retain them
        # as separate placeholders; never claim a filtered add captured them.
        if missing and not _constrained(request, boundary):
            members = members + missing
    return members, missing


def _whole_counts(total, samples=None):
    return {
        "episodes": total,
        "fullEpisodes": total if samples is None else samples,
        "segments": 0,
        "segmentEpisodes": 0,
        "unavailable": 0,
    }


def _dynamic_group_details(dataset, view, request, group_stage, wanted):
    """One card per dynamic group: the representative's media, every sample."""
    if not wanted:
        return []
    flat, _, _ = _scoped_view(dataset, request, flat=True)
    expr, _ = group_stage._get_group_expr(view)
    values = {
        str(doc["_id"]): doc.get("_group")
        for doc in flat.select(wanted)._aggregate(
            pipeline=[
                {"$addFields": {"_group": expr}},
                {"$project": {"_id": True, "_group": True}},
            ]
        )
    }
    details = sample_details_map(dataset, list(values))
    groups = []
    for rep_id, value in values.items():
        ids = view.get_dynamic_group(value).values("id")
        groups.append(
            {
                "episodeId": rep_id,
                "members": [
                    {"episodeId": sid, "kind": "episode"} for sid in ids
                ],
                "group": {"label": str(value), "size": len(ids)},
                **details.get(rep_id, {}),
            }
        )
    return groups


def resolve_scope(dataset, request):
    """Counts the complete scope and describes only the requested parents.

    Browsing never enumerates every member for the browser. ``episodeIds``
    limits the returned groups to the parents the tray needs: selected cards
    and clicked tiles. Missing saved references are reported separately.
    """
    view, boundary, converted = _scoped_view(dataset, request)
    wanted = [
        i for i in request.get("episodeIds") or [] if ObjectId.is_valid(i)
    ]
    group_stage = None if converted else _dynamic_group_stage(view)
    if converted or not (boundary.get("subsetId") or boundary.get("provider")):
        total = view.count()
        if _expands_groups(request, boundary, group_stage):
            flat, _, _ = _scoped_view(dataset, request, flat=True)
            return {
                "groups": _dynamic_group_details(
                    dataset, view, request, group_stage, wanted
                ),
                "unavailableGroups": [],
                "counts": _whole_counts(total, flat.count()),
            }
        groups = []
        if wanted:
            target = view._dataset if converted else dataset
            present = view.select(wanted).values("id")
            samples = sample_details_map(
                target, present, clips=converted and view._is_clips
            )
            groups = fosel.group_members(
                [{"episodeId": i, "kind": "episode"} for i in present],
                samples,
            )
        return {
            "groups": groups,
            "unavailableGroups": [],
            "counts": _whole_counts(total),
        }
    members, missing = _scope_members(
        dataset, view, boundary, converted, request
    )
    sample_ids = {m["episodeId"] for m in members}
    present = set(fosel.select_parents(dataset, sample_ids).values("id"))
    wanted_set = set(wanted)
    described = [m for m in members if m["episodeId"] in wanted_set]
    samples = sample_details_map(dataset, {m["episodeId"] for m in described})
    return {
        "groups": fosel.group_members(described, samples),
        "unavailableGroups": fosel.group_members(missing, {}),
        "counts": fosel.count_members(members, sample_ids - present),
    }


def resolve_candidates(dataset, request):
    """Resolves all scoped members once, including unloaded parent episodes."""
    view, boundary, converted = _scoped_view(dataset, request)
    members, missing = _scope_members(
        dataset, view, boundary, converted, request
    )
    sample_ids = {m["episodeId"] for m in members}
    target = view._dataset if converted else dataset
    samples = sample_details_map(
        target, sample_ids, clips=converted and view._is_clips
    )
    return {
        "groups": fosel.group_members(members, samples),
        "unavailableGroups": fosel.group_members(missing, {}),
        "counts": fosel.count_members(members, sample_ids - samples.keys()),
    }


def create_snapshot(dataset, request):
    """Resolves the complete scope once and freezes it server-side.

    The browser receives only a token and exact counts. Actions apply and
    retry against the token, so later browsing changes cannot move their
    targets. Abandoned snapshots expire.
    """
    view, boundary, converted = _scoped_view(dataset, request)
    members, missing = _scope_members(
        dataset, view, boundary, converted, request
    )
    members = fosel.normalize_members(members)
    unavailable = {m["episodeId"] for m in missing}
    now = datetime.now(timezone.utc)
    doc = {
        "_id": ObjectId(),
        "_dataset_id": dataset._doc.id,
        "created_at": now,
        "expires_at": now + SNAPSHOT_TTL,
        "count": len(members),
        "view": request.get("view") or [],
        "counts": fosel.count_members(members, unavailable),
    }
    chunks = _collection("selection_snapshot_members")
    for index, start in enumerate(range(0, len(members), SNAPSHOT_CHUNK)):
        chunks.insert_one(
            {
                "snapshot_id": doc["_id"],
                "_dataset_id": dataset._doc.id,
                "index": index,
                "expires_at": doc["expires_at"],
                "members": members[start : start + SNAPSHOT_CHUNK],
            }
        )
    _collection("selection_snapshots").insert_one(doc)
    return {"snapshotId": str(doc["_id"]), "counts": doc["counts"]}


def _expired(doc):
    expires = doc["expires_at"]
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires < datetime.now(timezone.utc)


def load_snapshot(dataset, snapshot_id):
    """Returns a frozen scope's members and the view they were read in."""
    if not ObjectId.is_valid(snapshot_id):
        raise ValueError("Unknown capture")
    doc = _collection("selection_snapshots").find_one(
        {"_id": ObjectId(snapshot_id), "_dataset_id": dataset._doc.id}
    )
    if doc is None or _expired(doc):
        raise ValueError("This capture has expired; open the action again")
    members = [
        member
        for chunk in _collection("selection_snapshot_members")
        .find({"snapshot_id": doc["_id"]})
        .sort("index", 1)
        for member in chunk["members"]
    ]
    if len(members) != doc["count"]:
        raise ValueError("This capture is incomplete; open the action again")
    return members, doc


def resolve_members(dataset, data):
    """Members for an action: explicit members, or a frozen server snapshot.

    Returns the members and the serialized view they belong to.
    """
    if data.get("snapshotId"):
        members, doc = load_snapshot(dataset, data["snapshotId"])
        return members, doc.get("view") or None
    return data["members"], data.get("view")


def _collection(name):
    collection = foo.get_db_conn()[name]
    collection.create_index("_dataset_id")
    collection.create_index("expires_at", expireAfterSeconds=0)
    if name == "selection_snapshot_members":
        collection.create_index([("snapshot_id", 1), ("index", 1)])
    return collection


def view_dataset(dataset, stages=None):
    """Returns the collection that owns the ids shown by the given stages.

    A converted view (patches, frames, clips) generates its own dataset, so
    ids captured there resolve against it rather than the source dataset.
    """
    if not stages:
        return dataset
    return fosv.get_view(dataset, stages=stages)._dataset


def selection_availability(dataset, episode_ids, stages=None):
    """Resolves live display metadata without changing captured membership."""
    target = view_dataset(dataset, stages)
    result = {episode_id: {"unavailable": True} for episode_id in episode_ids}
    present = sample_details_map(
        target, episode_ids, clips=target is not dataset and _is_clips(target)
    )
    for sample_id, details in present.items():
        result[sample_id] = {"unavailable": False, **details}
    return result


def _is_clips(generated_dataset):
    return generated_dataset.media_type == "video" and bool(
        generated_dataset.get_field("support")
    )


def sample_details_map(dataset, sample_ids, clips=False):
    """Resolves display metadata for many parents with a single projection.

    Plain media only needs each sample's filepath, so avoid loading full
    documents; media-reference datasets resolve their preview asset per sample.
    Clips also carry their first frame so previews start inside the clip.
    """
    view = fosel.select_parents(dataset, sample_ids)
    if dataset._contains_media_references():
        return {sample.id: sample_details(sample, dataset) for sample in view}
    if clips:
        ids, filepaths, supports, rates = view.values(
            ["id", "filepath", "support", "metadata.frame_rate"]
        )
        result = {}
        for sample_id, filepath, support, rate in zip(
            ids, filepaths, supports, rates
        ):
            details = {"filepath": filepath}
            if support and rate:
                details["previewStart"] = max(support[0] - 1, 0) / rate
            result[sample_id] = details
        return result
    if dataset.media_type == "group" and dataset.group_field:
        ids, filepaths, group_ids = view.values(
            ["id", "filepath", dataset.group_field + ".id"]
        )
        return {
            sample_id: {"filepath": filepath, "groupId": group_id}
            for sample_id, filepath, group_id in zip(ids, filepaths, group_ids)
        }
    ids, filepaths = view.values(["id", "filepath"])
    return {
        sample_id: {"filepath": filepath}
        for sample_id, filepath in zip(ids, filepaths)
    }


def sample_details(sample, dataset):
    """Resolves live thumbnail media without storing media content in captures."""
    if not dataset._contains_media_references():
        return {"filepath": sample.filepath}
    from fiftyone.multimodal.media_reference.field_model import (
        _resolve_media_references,
        MediaAssetRole,
    )

    reference = sample.media_reference.to_dict()
    resolved = _resolve_media_references(
        dataset, {reference["key"]: reference}
    )
    for asset in resolved[reference["key"]].assets:
        if asset.description.role == MediaAssetRole.VIDEO_STREAM:
            return {
                "filepath": asset.path,
                "previewStart": asset.description.selector.from_timestamp,
            }
    return {}


def candidate_members(view, provider=None):
    """Returns full episodes or normalized provider ranges in the given view."""
    if provider is None:
        return [
            {"episodeId": sample_id, "kind": "episode"}
            for sample_id in view.values("id")
        ]
    kind = provider.get("kind")
    if kind == "events":
        return _event_members(view, provider)
    if kind == "temporal-tags":
        return _tag_members(view, provider)
    if kind == "ranges":
        if any(m.get("kind") != "segment" for m in provider["members"]):
            raise ValueError("A range provider must return segments")
        allowed_ids = set(view.values("id"))
        return fosel.normalize_members(
            m for m in provider["members"] if m["episodeId"] in allowed_ids
        )
    raise ValueError("Unknown segment provider: %r" % kind)


def constrain_view(view, boundary):
    """Constrains grid pagination to complete provider results."""
    members = scoped_members(view, boundary)
    return view.select({m["episodeId"] for m in members})


def subset_boundary(dataset, boundary):
    """Selects a member kind without ever promoting saved segments."""
    subset_id = boundary["subsetId"]
    scope = boundary.get("subsetScope")
    if scope is None:
        members = fosub.subset_members(dataset, subset_id)
        kinds = {m["kind"] for m in members}
        if len(kinds) > 1:
            raise ValueError(
                "Choose Whole episodes or Saved segments for this mixed subset"
            )
        return members
    return fosub.subset_members(dataset, subset_id, scope)


def scoped_members(view, boundary):
    """Applies current matches within the saved time and stream boundary."""
    if not boundary.get("subsetId"):
        return candidate_members(view, boundary.get("provider"))
    allowed = subset_boundary(view._dataset, boundary)
    if boundary.get("provider"):
        return fosel.intersect_members(
            candidate_members(view, boundary["provider"]), allowed
        )
    by_episode = {}
    for member in allowed:
        by_episode.setdefault(member["episodeId"], []).append(member)
    return [
        m
        for episode_id in view.values("id")
        for m in by_episode.get(episode_id, [])
    ]


def validate_subset_stages(stages, extended_stages):
    """Fails closed for pipelines not yet supported inside a saved subset."""
    supported = {
        "Match",
        "MatchTags",
        "Exists",
        "Select",
        "Exclude",
        "SortBy",
        "Limit",
        "Skip",
        "FilterLabels",
        "FilterField",
        "SelectFields",
        "ExcludeFields",
        "SelectLabels",
        "ExcludeLabels",
        "MatchLabels",
    }
    classes = [stage["_cls"] for stage in stages or []] + list(
        extended_stages or {}
    )
    for cls in classes:
        if cls not in {"fiftyone.core.stages." + name for name in supported}:
            raise ValueError(
                "Stage %s is not supported within a saved subset; remove it or return to the dataset"
                % cls.rsplit(".", 1)[-1]
            )


def provider_options(dataset):
    """Lists built-in range sources without activating a range constraint."""
    fields = dataset.get_field_schema(
        ftype=fof.EmbeddedDocumentField,
        embedded_doc_type=fol.TemporalDetections,
    )
    return {
        "eventFields": list(fields) if dataset.media_type == "video" else [],
        "temporalTags": sorted(fot.count_temporal_tags(dataset)),
    }


def _event_members(view, provider):
    if view.media_type != "video":
        raise ValueError("Frame event ranges require a video source")
    field = provider["field"]
    schema = view.get_field_schema()
    if (
        field not in schema
        or not isinstance(schema[field], fof.EmbeddedDocumentField)
        or schema[field].document_type is not fol.TemporalDetections
    ):
        raise ValueError("Events require a TemporalDetections field")
    values = set(provider.get("values", []))
    result = []
    for sample in view.select_fields(field):
        labels = sample[field]
        for event in labels.detections if labels else []:
            if values and event.label not in values:
                continue
            start, end = event.support
            result.append(
                {
                    "episodeId": sample.id,
                    "kind": "segment",
                    "range": {
                        "start": str(start - 1),
                        "end": str(end),
                        "timebase": "sequence",
                        "streams": ["filepath"],
                        "provenance": [
                            {
                                "provider": "events",
                                "source": field,
                                "itemId": event.id,
                                "nativeStart": str(start),
                                "nativeEnd": str(end),
                            }
                        ],
                    },
                }
            )
    return fosel.normalize_members(result)


def _tag_members(view, provider):
    values = provider.get("values") or None
    tags = fot.list_temporal_tags(
        view, filter=fot.TemporalTagFilter(tags=values)
    )
    samples = {sample.id: sample for sample in view}
    result = []
    for tag in tags:
        sample_id = str(tag.sample_id)
        if sample_id not in samples:
            continue
        timebase = {1: "sequence", 2: "duration-ns", 3: "timestamp-ns"}.get(
            tag.index_type
        )
        if timebase is None:
            raise ValueError("Unsupported temporal tag timebase")
        streams = (
            [tag.anchor]
            if tag.anchor
            else _sample_streams(samples[sample_id], view._dataset)
        )
        result.append(
            {
                "episodeId": sample_id,
                "kind": "segment",
                "range": {
                    "start": str(tag.start),
                    "end": str(tag.end),
                    "timebase": timebase,
                    "streams": streams,
                    "provenance": [
                        {
                            "provider": "temporal-tags",
                            "source": tag.tag,
                            "itemId": str(tag.id),
                        }
                    ],
                },
            }
        )
    return fosel.normalize_members(result)


def _sample_streams(sample, dataset):
    if dataset.media_type == "video":
        return ["filepath"]
    from fiftyone.multimodal.media_reference.field_model import (
        addressable_media_sources,
    )

    reference = sample.media_reference
    if reference:
        source_id = reference.key.split("/", 1)[0]
        for source in dataset.media_sources:
            if (
                source["id"] == source_id
                and source.get("kind") == "lerobot-episode"
            ):
                root = addressable_media_sources(dataset)[source_id]
                info = fost.read_json(fost.join(root, "meta/info.json"))
                return [
                    "lerobot:" + name
                    for name in info["features"]
                    if name
                    not in {
                        "timestamp",
                        "frame_index",
                        "episode_index",
                        "index",
                        "task_index",
                    }
                ]
    raise ValueError(
        "This source cannot resolve all streams; use stream-anchored tags "
        "or a range provider with explicit stream IDs"
    )


_TAG_INDEX_TYPES = {"sequence": 1, "duration-ns": 2, "timestamp-ns": 3}


def tag_selection(
    dataset,
    members,
    change=None,
    target="members",
    stages=None,
    group_scope="slice",
):
    """Inspects or tags frozen episode and segment membership.

    Whole episodes use sample tags. Segments use temporal tags on each
    captured stream. Removal matches exact bounds; overlapping intervals and
    unselected streams are preserved. Every parent and range is validated
    before writing, and applying the same change again is idempotent.

    Args:
        dataset: the source dataset
        members: captured episode/segment dictionaries
        change (None): optional ``{"tag": str, "add": bool}`` mutation
        target ("members"): ``members`` or ``labels`` in whole episodes
        stages (None): the serialized view stages the members were captured
            in; a converted view (patches, frames, clips) tags its own
            elements, as the App's legacy tagger does
        group_scope ("slice"): for grouped datasets, ``slice`` tags only the
            captured samples and ``all`` tags every slice of their groups

    Returns:
        scope counts and the existing tag values on the captured targets
    """
    if target not in ("members", "labels"):
        raise ValueError("Choose members or labels to tag")
    members = fosel.normalize_members(members)
    if target == "labels" and any(m["kind"] == "segment" for m in members):
        raise ValueError("Label tagging requires whole episodes")
    if not members:
        raise ValueError("Choose samples or segments to tag")
    sample_ids = {member["episodeId"] for member in members}
    scope = fosv.get_view(dataset, stages=stages) if stages else dataset
    if scope._dataset is not dataset:
        if any(m["kind"] == "segment" for m in members):
            raise ValueError("Segments are tagged in the samples view")
        return _tag_converted(scope, sample_ids, change, target)
    view = fosel.select_parents(dataset, sample_ids)
    if set(view.values("id")) != sample_ids:
        raise ValueError("Remove unavailable episodes before tagging")
    if dataset.media_type == "group" and group_scope == "all":
        # Every slice of the captured samples' groups becomes a whole member.
        group_ids = view.values(dataset.group_field + ".id")
        view = dataset.select_groups(group_ids).select_group_slices(
            _allow_mixed=True
        )
        sample_ids = set(view.values("id"))
        members = [{"episodeId": sid, "kind": "episode"} for sid in sample_ids]

    full = []
    targets = {}
    for member in members:
        sample_id = member["episodeId"]
        if member["kind"] == "episode":
            full.append(sample_id)
            continue
        bounds = member["range"]
        index_type = _TAG_INDEX_TYPES.get(bounds["timebase"])
        if index_type is None:
            raise ValueError("This segment timebase does not support tags")
        start, end = int(bounds["start"]), int(bounds["end"])
        if not -(2**63) <= start < end < 2**63:
            raise ValueError("Tag bounds must fit signed 64-bit integers")
        targets.setdefault((sample_id, index_type, start, end), set()).update(
            bounds["streams"]
        )

    existing = []
    if targets:
        for tag in fot.list_temporal_tags(view):
            streams = targets.get(
                (str(tag.sample_id), tag.index_type, tag.start, tag.end)
            )
            if streams is None:
                continue
            anchors = (
                {tag.anchor}
                if tag.anchor
                else set(_sample_streams(dataset[str(tag.sample_id)], dataset))
            )
            if anchors <= streams:
                existing.append(tag)

    full_view = fosel.select_parents(dataset, full)
    label_count = None
    if target == "labels":
        counts, _ = fostag.build_label_tag_aggregations(full_view)
        label_count = sum(full_view.aggregate(counts)) if counts else 0
    if change is not None:
        tag_value = change.get("tag")
        add = change.get("add")
        if (
            not isinstance(tag_value, str)
            or not tag_value.strip()
            or not isinstance(add, bool)
        ):
            raise ValueError("Provide a nonempty tag and an add boolean")
        tag_value = tag_value.strip()
        if target == "labels":
            if not label_count:
                raise ValueError("No labels in these episodes")
            if add:
                full_view.tag_labels(tag_value)
            else:
                full_view.untag_labels(tag_value)
        if targets:
            if add:
                fot.add_temporal_tags(
                    view,
                    [
                        fot.TemporalTag(
                            sample_id=sample_id,
                            index_type=index_type,
                            start=start,
                            end=end,
                            anchor=stream,
                            tag=tag_value,
                        )
                        for (
                            sample_id,
                            index_type,
                            start,
                            end,
                        ), streams in targets.items()
                        for stream in streams
                    ],
                )
            else:
                ids = [tag.id for tag in existing if tag.tag == tag_value]
                if ids:
                    fot.delete_temporal_tags(view, ids=ids)
        if full and target == "members":
            if add:
                full_view.tag_samples(tag_value)
            else:
                full_view.untag_samples(tag_value)

    return {
        "counts": fosel.count_members(members),
        "tags": sorted(_tag_values(dataset, full_view, full, targets, target)),
        "labels": label_count,
    }


def _tag_converted(scope, sample_ids, change, target):
    """Tags patches, frames, or clips exactly as the legacy grid tagger does."""
    full_view = scope.select(sample_ids)
    if set(full_view.values("id")) != sample_ids:
        raise ValueError("Remove unavailable items before tagging")
    label_count = None
    if target == "labels":
        counts, _ = fostag.build_label_tag_aggregations(full_view)
        label_count = sum(full_view.aggregate(counts)) if counts else 0
    if change is not None:
        tag_value = change.get("tag")
        add = change.get("add")
        if (
            not isinstance(tag_value, str)
            or not tag_value.strip()
            or not isinstance(add, bool)
        ):
            raise ValueError("Provide a nonempty tag and an add boolean")
        tag_value = tag_value.strip()
        if target == "labels":
            if not label_count:
                raise ValueError("No labels in these items")
            if add:
                full_view.tag_labels(tag_value)
            else:
                full_view.untag_labels(tag_value)
        elif add:
            full_view.tag_samples(tag_value)
        else:
            full_view.untag_samples(tag_value)
    members = [{"episodeId": sid, "kind": "episode"} for sid in sample_ids]
    return {
        "counts": fosel.count_members(members),
        "tags": sorted(
            _tag_values(
                scope._dataset, full_view, list(sample_ids), {}, target
            )
        ),
        "labels": label_count,
    }


def _tag_values(dataset, full_view, full, targets, target):
    """Lists tag values relevant to the scope, after any change was applied."""
    if target == "labels":
        _, tag_aggs = fostag.build_label_tag_aggregations(full_view)
        histograms = dataset.aggregate(tag_aggs) if tag_aggs else []
        values = {
            value
            for histogram in histograms
            for value in histogram
            if value is not None
        }
    else:
        values = set(dataset.distinct("tags")) if full else set()
    if targets:
        values.update(fot.count_temporal_tags(dataset))
    return values
