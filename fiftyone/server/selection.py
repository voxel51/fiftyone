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
import fiftyone.core.tags as fot
import fiftyone.server.view as fosv


def resolve_candidates(dataset, request):
    """Resolves all scoped members once, including unloaded parent episodes."""
    view = fosv.get_view(
        dataset,
        stages=request.get("view"),
        filters=copy.deepcopy(request.get("filters", {})),
        extended_stages=copy.deepcopy(request.get("extendedStages", {})),
        sort_by=request.get("sortBy"),
        desc=request.get("desc", False),
    )
    if view._dataset is not dataset or view.media_type not in (
        "video",
        "multimodal",
    ):
        raise ValueError("Selection requires an episode-preserving view")
    boundary = request.get("boundary", {})
    members = candidate_members(view, boundary.get("provider"))
    sample_ids = {m["episodeId"] for m in members}
    samples = {
        sample.id: sample_details(sample, dataset)
        for sample in dataset.select(sample_ids)
    }
    return {
        "groups": fosel.group_members(members, samples),
        "counts": fosel.count_members(members, sample_ids - samples.keys()),
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
    members = candidate_members(view, boundary.get("provider"))
    return view.select({m["episodeId"] for m in members})


def provider_options(dataset):
    """Lists built-in range sources without activating a range constraint."""
    fields = dataset.get_field_schema(
        ftype=fof.EmbeddedDocumentField,
        embedded_doc_type=fol.TemporalDetections,
    )
    return {
        "eventFields": list(fields),
        "temporalTags": sorted(fot.count_temporal_tags(dataset)),
    }


def _event_members(view, provider):
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
