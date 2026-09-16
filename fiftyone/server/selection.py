"""
Resolution of complete grid selection scopes, independent of pagination.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy

import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.selection as fosel
import fiftyone.core.storage as fost
import fiftyone.core.subsets as fosub
import fiftyone.core.tags as fot
import fiftyone.server.tags as fostag
import fiftyone.server.view as fosv


def resolve_candidates(dataset, request):
    """Resolves all scoped members once, including unloaded parent episodes."""
    boundary = request.get("boundary", {})
    filters = copy.deepcopy(request.get("filters", {}))
    if boundary.get("subsetId"):
        filters["_selection_scope"] = boundary
    view = fosv.get_view(
        dataset,
        stages=request.get("view"),
        filters=filters,
        extended_stages=copy.deepcopy(request.get("extendedStages", {})),
        sort_by=request.get("sortBy"),
        desc=request.get("desc", False),
    )
    if view._dataset is not dataset or view.media_type == "group":
        raise ValueError(
            "Selection requires a sample-preserving view of an ungrouped "
            "dataset"
        )
    members = scoped_members(view, boundary)
    missing = []
    if boundary.get("subsetId"):
        allowed = subset_boundary(dataset, boundary)
        present = set(
            dataset.select({m["episodeId"] for m in allowed}).values("id")
        )
        missing = [m for m in allowed if m["episodeId"] not in present]
        # Missing parents cannot be evaluated against live criteria. Retain them
        # as separate placeholders; never claim a filtered add captured them.
        constrained = bool(
            request.get("view")
            or request.get("filters")
            or request.get("extendedStages")
            or boundary.get("provider")
        )
        if missing and not constrained:
            members += missing
    sample_ids = {m["episodeId"] for m in members}
    samples = sample_details_map(dataset, sample_ids)
    return {
        "groups": fosel.group_members(members, samples),
        "unavailableGroups": fosel.group_members(missing, {}),
        "counts": fosel.count_members(members, sample_ids - samples.keys()),
    }


def selection_availability(dataset, episode_ids):
    """Resolves live display metadata without changing captured membership."""
    result = {episode_id: {"unavailable": True} for episode_id in episode_ids}
    for sample in dataset.select(episode_ids):
        result[sample.id] = {
            "unavailable": False,
            **sample_details(sample, dataset),
        }
    return result


def sample_details_map(dataset, sample_ids):
    """Resolves display metadata for many parents with a single projection.

    Plain media only needs each sample's filepath, so avoid loading full
    documents; media-reference datasets resolve their preview asset per sample.
    """
    view = dataset.select(sample_ids)
    if not dataset._contains_media_references():
        ids, filepaths = view.values(["id", "filepath"])
        return {
            sample_id: {"filepath": filepath}
            for sample_id, filepath in zip(ids, filepaths)
        }
    return {sample.id: sample_details(sample, dataset) for sample in view}


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


def tag_selection(dataset, members, change=None, target="members"):
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

    Returns:
        scope counts and the existing tag values on the captured targets
    """
    if target not in ("members", "labels"):
        raise ValueError("Choose members or labels to tag")
    members = fosel.normalize_members(members)
    if target == "labels" and any(m["kind"] == "segment" for m in members):
        raise ValueError("Label tagging requires whole episodes")
    if not members or dataset.media_type == "group":
        raise ValueError("Choose samples or segments to tag")
    sample_ids = {member["episodeId"] for member in members}
    view = dataset.select(sample_ids)
    if set(view.values("id")) != sample_ids:
        raise ValueError("Remove unavailable episodes before tagging")

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

    full_view = dataset.select(full)
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
