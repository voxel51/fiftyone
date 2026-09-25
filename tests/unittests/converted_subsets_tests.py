"""
Durable source references for generated frame and clip subsets.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import copy
import unittest
from unittest.mock import patch
from uuid import uuid4

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.core.selection as fosel
import fiftyone.core.selection_refs as fosr
import fiftyone.core.subsets as fosub
import fiftyone.server.selection as foss
from fiftyone.server.view import get_view


class ConvertedSubsetTests(unittest.TestCase):
    def setUp(self):
        self.dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="/tmp/converted-subsets.mp4",
            metadata=fo.VideoMetadata(
                frame_width=32,
                frame_height=24,
                frame_rate=10,
                total_frame_count=10,
                duration=1,
            ),
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="a", support=[1, 4]),
                    fo.TemporalDetection(label="b", support=[1, 4]),
                ]
            ),
            ranges=[[1, 4], [1, 4], [3, 6]],
        )
        for number in (1, 2, 4):
            sample.frames[number] = fo.Frame(
                tracks=fo.Detections(
                    detections=[
                        fo.Detection(label="bird", index=1),
                        fo.Detection(label="bird", index=2),
                    ]
                )
            )
        self.dataset.add_sample(sample)
        self.sample_id = sample.id

    def tearDown(self):
        self.dataset.delete()

    def save(self, view, members=None):
        subset = fosub.create_subset(
            self.dataset, "Saved", view=view._serialize()
        )
        if members is None:
            members = list(fosr.iter_members(view))
        result = self.add(subset["id"], view, members)
        return subset["id"], members, result

    def add(self, subset_id, view, members, operation=None):
        operation = operation or str(uuid4())
        foss.prepare_subset_add(
            self.dataset,
            {
                "subsetId": subset_id,
                "view": view._serialize(),
                "operationId": operation,
                "members": members,
            },
        )
        return fosub.apply_add(self.dataset, operation)

    def open(self, subset_id, view=None):
        stages = (
            view._serialize()
            if view is not None
            else fosub.subset_summary(self.dataset, subset_id)["view"]
        )
        return get_view(
            self.dataset,
            stages=stages,
            selection_scope={
                "subsetId": subset_id,
                "subsetScope": "episodes",
            },
        )

    def test_frames_survive_materialization_and_remove_by_source_position(
        self,
    ):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, members, result = self.save(
            frames, list(fosr.iter_members(frames.skip(3).limit(3)))
        )
        self.assertEqual(result["counts"]["fullEpisodes"], 3)
        self.assertEqual(
            {m["reference"]["frameNumber"] for m in members}, {4, 5, 6}
        )
        old_ids = {m["episodeId"] for m in members}
        # A new collection gives frames without native documents fresh IDs.
        frames._dataset.delete()
        recreated = self.dataset.to_frames(sample_frames="dynamic")
        reopened = self.open(subset, recreated)
        self.assertEqual(sorted(reopened.values("frame_number")), [4, 5, 6])
        resolved = list(fosub.iter_view_members(reopened, subset))
        self.assertNotEqual({m["episodeId"] for m in resolved}, old_ids)
        self.assertEqual(
            {fosel.member_key(m) for m in members},
            {fosel.member_key(m) for m in resolved},
        )
        duplicate = self.add(subset, recreated, resolved)
        self.assertEqual(duplicate["duplicates"], 3)
        fosub.remove_members(self.dataset, subset, resolved[:1])
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)
        self.assertEqual(self.open(subset).count(), 2)
        self.assertEqual(
            fosub.browse_subsets(self.dataset, view=recreated._serialize())[
                "total"
            ],
            1,
        )

    def test_annotation_clips_follow_labels_not_equal_bounds(self):
        clips = self.dataset.to_clips("events")
        subset, members, result = self.save(clips)
        self.assertEqual(result["counts"]["fullEpisodes"], 2)
        self.assertEqual(len({fosel.member_key(m) for m in members}), 2)
        sample = self.dataset.first()
        sample.events.detections[0].support = [2, 8]
        sample.events.detections.pop()
        sample.save()
        clips._dataset.delete()
        recreated = self.dataset.to_clips("events")
        reopened = self.open(subset, recreated)
        self.assertEqual(reopened.values("support"), [[2, 8]])
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)
        self.assertEqual(
            fosub.subset_counts(self.dataset, subset)["unavailable"], 1
        )
        self.assertEqual(
            len(fosub.missing_member_page(self.dataset, subset)), 1
        )

    def test_anonymous_clips_freeze_exact_bounds_and_deduplicate(self):
        clips = self.dataset.to_clips([[[1, 4], [1, 4], [3, 6]]])
        subset, members, result = self.save(clips)
        self.assertEqual(len(members), 2)
        self.assertEqual(result["counts"]["fullEpisodes"], 2)
        self.assertEqual(result["counts"]["unavailable"], 0)
        clips._dataset.delete()
        # The current conversion has different, overlapping ranges. Saved
        # membership must neither broaden nor vanish when reopened here.
        different = self.dataset.to_clips([[[2, 5], [1, 9]]])
        reopened = self.open(subset, different)
        self.assertEqual(sorted(reopened.values("support")), [[1, 4], [3, 6]])
        self.assertEqual(
            fosub.view_counts(reopened.limit(1), subset)["fullEpisodes"], 1
        )
        captured = list(fosub.iter_view_members(reopened, subset))
        self.assertEqual(
            self.add(subset, different, captured)["duplicates"], 2
        )
        self.dataset.delete_samples(self.sample_id)
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)
        self.assertEqual(
            fosub.subset_counts(self.dataset, subset)["unavailable"], 2
        )

    def test_snapshot_deduplicates_ranges_before_preparing(self):
        clips = self.dataset.to_clips([[[1, 4], [1, 4], [3, 6]]])
        capture = foss.create_snapshot(
            self.dataset, {"view": clips._serialize()}
        )
        self.assertEqual(capture["counts"]["fullEpisodes"], 2)
        subset = fosub.create_subset(
            self.dataset, "Snapshot", view=clips._serialize()
        )["id"]
        operation = str(uuid4())
        foss.prepare_subset_add(
            self.dataset,
            {
                "subsetId": subset,
                "operationId": operation,
                "snapshotId": capture["snapshotId"],
            },
        )
        fosub.apply_add(self.dataset, operation)
        self.assertEqual(self.open(subset).count(), 2)

    def test_tracks_with_equal_bounds_remain_distinct_after_regeneration(self):
        tracks = self.dataset.to_trajectories("frames.tracks")
        subset, members, result = self.save(tracks)
        self.assertEqual(result["counts"]["fullEpisodes"], 2)
        self.assertEqual({m["reference"]["index"] for m in members}, {1, 2})
        tracks._dataset.delete()
        recreated = self.dataset.to_trajectories("frames.tracks")
        reopened = self.open(subset, recreated)
        self.assertEqual(reopened.count(), 2)
        resolved = list(fosub.iter_view_members(reopened, subset))
        self.assertEqual(
            self.add(subset, recreated, resolved)["duplicates"], 2
        )
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)

    def test_references_reject_foreign_sources_and_wrong_domains(self):
        clips = self.dataset.to_clips("events")
        subset, members, _ = self.save(clips)
        for updates in (
            {"sampleId": str(ObjectId())},
            {"field": "other"},
            {"type": "frame", "frameNumber": 1},
        ):
            forged = copy.deepcopy(members[:1])
            forged[0]["reference"].update(updates)
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                self.add(subset, clips, forged)
        with self.assertRaises(ValueError):
            self.add(
                subset,
                self.dataset.to_frames(sample_frames="dynamic"),
                members,
            )
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)

    def test_generated_sample_tags_are_rejected_and_label_clips_tag_only_source(
        self,
    ):
        clips = self.dataset.to_clips("events")
        members = list(fosr.iter_members(clips.limit(1)))
        with self.assertRaisesRegex(ValueError, "source label"):
            foss.tag_selection(
                self.dataset,
                members,
                {"tag": "bad", "add": True},
                stages=clips._serialize(),
            )
        result = foss.tag_selection(
            self.dataset,
            members,
            {"tag": "review", "add": True},
            target="labels",
            stages=clips._serialize(),
        )
        self.assertEqual(result["targets"], 1)
        self.assertEqual(result["applied"], {"review": 1})
        sample = self.dataset.first()
        self.assertEqual(sample.events.detections[0].tags, ["review"])
        self.assertEqual(sample.events.detections[1].tags, [])
        self.assertEqual(sample.tags, [])
        self.assertEqual(self.dataset.count_label_tags(), {"review": 1})

    def test_anonymous_and_trajectory_clips_do_not_tag_contained_labels(self):
        for view in (
            self.dataset.to_clips([[[1, 4]]]),
            self.dataset.to_trajectories("frames.tracks"),
        ):
            members = list(fosr.iter_members(view))
            result = foss.tag_selection(
                self.dataset,
                members,
                target="labels",
                stages=view._serialize(),
            )
            self.assertEqual(result["targets"], 0)
            self.assertIn("no single source label", result["disabledReason"])
            with self.assertRaises(ValueError):
                foss.tag_selection(
                    self.dataset,
                    members,
                    {"tag": "bad", "add": True},
                    target="labels",
                    stages=view._serialize(),
                )
        self.assertEqual(self.dataset.count_label_tags(), {})

    def test_frames_from_new_videos_and_retries_use_coordinates(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, members, _ = self.save(
            frames, list(fosr.iter_members(frames.limit(1)))
        )
        operation = str(uuid4())
        self.add(subset, frames, members, operation=operation)
        changed = copy.deepcopy(members)
        changed[0]["episodeId"] = str(ObjectId())
        self.assertTrue(
            fosub.is_add_prepared(
                self.dataset, subset, operation, members=changed
            )
        )
        self.add(subset, frames, changed, operation=operation)
        sample = self.dataset.first().copy()
        sample.filepath = "/tmp/new-video.mp4"
        self.dataset.add_sample(sample)
        new = self.dataset.to_frames(sample_frames="dynamic")
        captured = list(
            fosr.iter_members(
                new.match({"_sample_id": ObjectId(sample.id)}).limit(1)
            )
        )
        self.add(subset, new, captured)
        self.assertEqual(self.open(subset).count(), 2)
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)

    def test_frame_membership_operations_do_not_materialize_a_view(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.limit(2)))
        subset = fosub.create_subset(
            self.dataset, "No materialization", view=frames._serialize()
        )["id"]
        with patch.object(
            fosub,
            "load_materialized_view",
            side_effect=AssertionError("must not materialize"),
        ):
            operation = str(uuid4())
            fosub.prepare_add(self.dataset, subset, operation, members)
            fosub.apply_add(self.dataset, operation)
            self.assertEqual(
                fosub.subset_counts(self.dataset, subset)["episodes"], 2
            )

    def test_frame_modal_and_grid_share_a_cache(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, _, _ = self.save(
            frames, list(fosr.iter_members(frames.limit(2)))
        )
        stages = fosub.subset_summary(self.dataset, subset)["view"]
        grid = self.open(subset)
        modal = get_view(self.dataset, stages=stages)
        self.assertEqual(grid._dataset.name, modal._dataset.name)
        self.assertEqual(
            set(modal.select(grid.values("id")).values("id")),
            set(grid.values("id")),
        )

    def test_frame_label_tags_reach_native_source_records(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.match({"frame_number": 1})))
        frames._dataset.delete()
        frames = self.dataset.to_frames(sample_frames="dynamic")
        result = foss.tag_selection(
            self.dataset,
            members,
            {"tag": "frame-review", "add": True},
            target="labels",
            stages=frames._serialize(),
        )
        self.assertEqual(result["targets"], 2)
        self.assertEqual(self.dataset.count_label_tags(), {"frame-review": 2})
        self.assertEqual(self.dataset.count_sample_tags(), {})

    def test_source_deletion_is_visible_without_regenerating_cached_rows(self):
        clips = self.dataset.to_clips("events")
        subset, _, _ = self.save(clips)
        sample = self.dataset.first()
        sample.events.detections.pop()
        sample.save()
        self.assertEqual(
            fosub.subset_counts(self.dataset, subset)["unavailable"], 1
        )
        self.assertEqual(self.open(subset).count(), 1)
        self.dataset.delete_samples(self.sample_id)
        self.assertEqual(
            fosub.subset_counts(self.dataset, subset)["unavailable"], 2
        )
        self.assertEqual(self.open(subset).count(), 0)
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)

    def test_concurrent_frame_materialization_shares_one_published_cache(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        import fiftyone.core.video as fovi

        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, _, _ = self.save(
            frames, list(fosr.iter_members(frames.limit(2)))
        )
        original = fovi.make_frames_dataset
        barrier = Barrier(2)

        def generate(*args, **kwargs):
            barrier.wait(timeout=10)
            return original(*args, **kwargs)

        with patch.object(fovi, "make_frames_dataset", generate):
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(
                    executor.map(lambda _: self.open(subset), range(2))
                )
        self.assertEqual(results[0]._dataset.name, results[1]._dataset.name)
        self.assertEqual(
            set(results[0].values("id")), set(results[1].values("id"))
        )

    def test_tagging_uses_live_frame_labels_without_restoring_deleted_labels(
        self,
    ):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.match({"frame_number": 1})))
        sample = self.dataset.first()
        sample.frames[1].tracks.detections.pop()
        sample.save()
        result = foss.tag_selection(
            self.dataset,
            members,
            {"tag": "live", "add": True},
            target="labels",
            stages=frames._serialize(),
        )
        self.assertEqual(result["targets"], 1)
        self.assertEqual(self.dataset.count_label_tags(), {"live": 1})
        self.assertEqual(self.dataset.count("frames.tracks.detections"), 5)

    def test_native_frame_files_and_dynamic_frames_share_membership(self):
        sample = self.dataset.first()
        for frame in sample.frames.values():
            frame["filepath"] = "/tmp/native-%d.jpg" % frame.frame_number
        sample.save()
        native = self.dataset.to_frames(sample_frames=False)
        subset, members, _ = self.save(native)
        dynamic = self.dataset.to_frames(sample_frames="dynamic")
        reopened = self.open(subset, dynamic)
        self.assertEqual(sorted(reopened.values("frame_number")), [1, 2, 4])
        self.assertEqual(
            self.add(
                subset,
                dynamic,
                list(fosub.iter_view_members(reopened, subset)),
            )["duplicates"],
            3,
        )

    def test_grouped_video_slices_reopen_frames_and_frozen_clips(self):
        grouped = fo.Dataset()
        try:
            group = fo.Group()
            video = self.dataset.first().copy()
            video["group"] = group.element("video")
            image = fo.Sample(
                filepath="/tmp/grouped-still.jpg", group=group.element("image")
            )
            grouped.add_samples([video, image])
            videos = grouped.select_group_slices(media_type="video")
            for view in (
                videos.to_frames(sample_frames="dynamic").limit(2),
                videos.to_clips([[[1, 3]]]),
            ):
                subset = fosub.create_subset(
                    grouped, "Grouped", view=view._serialize()
                )["id"]
                op = str(uuid4())
                foss.prepare_subset_add(
                    grouped,
                    {
                        "subsetId": subset,
                        "operationId": op,
                        "view": view._serialize(),
                        "members": list(fosr.iter_members(view)),
                    },
                )
                fosub.apply_add(grouped, op)
                saved = fosub.subset_summary(grouped, subset)
                opened = get_view(
                    grouped,
                    stages=saved["view"],
                    selection_scope={
                        "subsetId": subset,
                        "subsetScope": "episodes",
                    },
                )
                self.assertEqual(opened.count(), saved["memberCount"])
        finally:
            grouped.delete()

    def test_frame_subset_materializes_only_saved_positions(self):
        import fiftyone.core.video as fovi

        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.limit(2)))
        with patch.object(
            fovi,
            "_init_frames",
            side_effect=AssertionError("enumerated source frames"),
        ):
            subset, _, _ = self.save(frames, members)
            opened = self.open(subset)
        self.assertEqual(opened._dataset.count(), 2)
        self.assertEqual(opened.count(), 2)

    def test_duplicate_adds_and_absent_removals_reuse_the_frame_cache(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.limit(2)))
        subset, _, _ = self.save(frames, members)
        original = self.open(subset)._dataset.name
        self.assertEqual(self.add(subset, frames, members)["duplicates"], 2)
        self.assertEqual(self.open(subset)._dataset.name, original)
        absent = list(fosr.iter_members(frames.skip(2).limit(1)))
        fosub.remove_members(self.dataset, subset, absent)
        self.assertEqual(self.open(subset)._dataset.name, original)

    def test_membership_changes_preserve_inflight_frame_views(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, _, _ = self.save(
            frames, list(fosr.iter_members(frames.limit(2)))
        )
        previous = self.open(subset)
        self.add(
            subset, frames, list(fosr.iter_members(frames.skip(2).limit(1)))
        )
        current = self.open(subset)
        self.assertNotEqual(previous._dataset.name, current._dataset.name)
        self.assertEqual(current.count(), 3)
        self.assertEqual(previous.count(), 2)
        names = (previous._dataset.name, current._dataset.name)
        fosub.delete_subset(self.dataset, subset)
        self.assertTrue(all(not fo.dataset_exists(name) for name in names))
        self.assertEqual(self.dataset.count(), 1)

    def test_clip_lookups_scale_with_members_and_requested_rows(self):
        count = 200
        sample = self.dataset.first()
        sample.metadata.total_frame_count = count + 1
        sample.save()
        clips = self.dataset.to_clips(
            [[[number, number + 1] for number in range(1, count + 1)]]
        )
        subset, _, _ = self.save(clips)
        base, _ = fosub.subset_base_view(self.dataset, subset)

        for ids, expected in ((None, count), ([base.first().id], 1)):
            view = fosub.select_subset(base, subset, parent_ids=ids)
            self.assertEqual(view.count(), expected)
            self.assert_indexed_lookups(view, expected)

    def test_trajectory_lookup_uses_the_complete_track_identity_index(self):
        sample = self.dataset.first()
        sample.frames[1].tracks.detections = [
            fo.Detection(label="bird", index=index) for index in range(1, 201)
        ]
        sample.save()
        tracks = self.dataset.to_clips("frames.tracks", trajectories=True)
        subset, _, _ = self.save(tracks)
        opened = self.open(subset)
        self.assertEqual(opened.count(), 200)
        self.assert_indexed_lookups(opened, 200)

    def assert_indexed_lookups(self, view, max_docs):
        def lookup_stats(value):
            if isinstance(value, dict):
                if "$lookup" in value and "totalDocsExamined" in value:
                    yield value
                for item in value.values():
                    yield from lookup_stats(item)
            elif isinstance(value, list):
                for item in value:
                    yield from lookup_stats(item)

        explain = foo.get_db_conn().command(
            {
                "explain": {
                    "aggregate": view._dataset._sample_collection_name,
                    "pipeline": view._pipeline(attach_frames=False)
                    + [{"$count": "count"}],
                    "cursor": {},
                },
                "verbosity": "executionStats",
            }
        )
        stats = list(lookup_stats(explain))
        self.assertTrue(stats)
        for lookup in stats:
            self.assertEqual(lookup["collectionScans"], 0)
            if lookup["$lookup"]["from"] in (
                view._dataset._sample_collection_name,
                "subset_members",
            ):
                self.assertLessEqual(lookup["totalDocsExamined"], max_docs)

    def test_reference_validation_batches_live_and_missing_sources(self):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        members = list(fosr.iter_members(frames.limit(5)))
        missing = copy.deepcopy(members[:1])
        missing[0]["reference"]["sampleId"] = str(ObjectId())
        with patch.object(fosub, "_BATCH_SIZE", 2):
            self.assertEqual(
                fosub._missing_references(frames, missing + members),
                {fosel.member_key(missing[0])},
            )

    def test_reused_cache_names_do_not_reopen_or_delete_unrelated_datasets(
        self,
    ):
        frames = self.dataset.to_frames(sample_frames="dynamic")
        subset, _, _ = self.save(
            frames, list(fosr.iter_members(frames.limit(2)))
        )
        cached = self.open(subset)._dataset
        name = cached.name
        cached.delete()
        unrelated = fo.Dataset(name=name)
        try:
            unrelated.add_sample(fo.Sample(filepath="/tmp/unrelated.jpg"))
            reopened = self.open(subset)
            self.assertNotEqual(reopened._dataset.name, name)
            self.assertEqual(reopened.count(), 2)
            fosub.delete_subset(self.dataset, subset)
            self.assertEqual(unrelated.count(), 1)
        finally:
            unrelated.delete()

    def test_clip_ranges_respect_known_bounds_and_retain_missing_members(self):
        clips = self.dataset.to_clips([[[1, 4]]])
        subset, members, _ = self.save(clips)
        invalid = copy.deepcopy(members)
        invalid[0]["reference"]["support"] = [1, 11]
        with self.assertRaises(ValueError):
            self.add(subset, clips, invalid)
        sample = self.dataset.first()
        sample.metadata.total_frame_count = 3
        sample.save()
        self.assertEqual(fosub.member_count(self.dataset, subset), 1)
        self.assertEqual(
            fosub.subset_counts(self.dataset, subset)["unavailable"], 1
        )
        self.assertEqual(self.open(subset).count(), 0)
        # Unknown bounds don't trigger metadata extraction or reject ranges.
        sample.metadata.total_frame_count = None
        sample.save()
        self.add(subset, clips, invalid)
        self.assertEqual(fosub.member_count(self.dataset, subset), 2)
