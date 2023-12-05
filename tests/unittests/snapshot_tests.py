"""
FiftyOne dataset-snapshot related unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import re
import unittest

import bson

import fiftyone as fo
import fiftyone.core.dataset as fod

from decorators import drop_datasets
from fiftyone.core.readonly import ReadOnlyObjectException
import fiftyone.core.runs as focr


class DatasetSnapshotTests(unittest.TestCase):
    @staticmethod
    def _create_snapshot_dataset_magic(head_dataset, snapshot_name):
        # <snapshotMagic>
        _dataset_id = str(head_dataset._doc.id)
        _internal_snapshot_name = f"_snapshot__{_dataset_id}_{snapshot_name}"
        # Create the snapshot dataset so it saves to database, but then we
        #   need to delete the singleton so the test will function properly.
        head_dataset.clone(_internal_snapshot_name)
        fo.Dataset._instances.pop(_internal_snapshot_name)
        # </snapshotMagic>
        return _internal_snapshot_name

    @drop_datasets
    def test_dataset_snapshots(self):
        dataset_name = self.test_dataset_snapshots.__name__
        snapshot_name = "my-snapshot"
        fo.Dataset(dataset_name)

        # Load HEAD dataset and test its name properties
        head_dataset = fo.load_dataset(dataset_name)

        def _check_head_collection(collection):
            self.assertIsNone(collection.snapshot_name)
            self.assertEqual(collection.head_name, dataset_name)
            self.assertFalse(collection.is_snapshot)
            self.assertNotIn("Snapshot:", collection.summary())

        _check_head_collection(head_dataset)
        view = head_dataset.limit(1)
        _check_head_collection(view)

        _internal_snapshot_name = self._create_snapshot_dataset_magic(
            head_dataset, snapshot_name
        )

        # Load snapshot dataset and test its name properties
        snapshot = fo.load_dataset(dataset_name, snapshot=snapshot_name)

        # Also try loading directly from materialized name, it should be the
        #   same instance.
        snapshot2 = fo.load_dataset(_internal_snapshot_name)
        assert snapshot2 is snapshot

        def _check_snapshot_collection(collection, summary_dataset_label):
            self.assertEqual(collection.snapshot_name, snapshot_name)
            self.assertEqual(collection.head_name, dataset_name)
            self.assertTrue(collection.is_snapshot)
            summary = collection.summary()
            snapshot_match_str = rf"Snapshot:\s+{snapshot_name}"
            self.assertTrue(bool(re.findall(snapshot_match_str, summary)))
            name_match_str = rf"{summary_dataset_label}:\s+{dataset_name}"
            self.assertTrue(bool(re.findall(name_match_str, summary)))
            self.assertNotIn(_internal_snapshot_name, summary)

        _check_snapshot_collection(snapshot, "Name")
        _check_snapshot_collection(snapshot2, "Name")
        view = snapshot.limit(1)
        view2 = snapshot2.limit(1)
        _check_snapshot_collection(view, "Dataset")
        _check_snapshot_collection(view2, "Dataset")

    def test_unknown_snapshot(self):
        dataset_name = self.test_unknown_snapshot.__name__

        head_dataset = fo.Dataset(dataset_name)

        _internal_snapshot_name = fod._snapshot_to_materialized_dataset_name(
            head_dataset._doc.id, "unknown"
        )

        # Test unknown snapshots
        self.assertRaises(ValueError, fo.load_dataset, dataset_name, "unknown")
        try:
            fo.load_dataset(dataset_name, snapshot="unknown")
        except ValueError as e:
            self.assertNotIn(_internal_snapshot_name, str(e))

        # Materialized name for unknown snapshot
        self.assertRaises(ValueError, fo.load_dataset, _internal_snapshot_name)

        # Materialized name for unknown dataset
        self.assertRaises(
            ValueError,
            fo.load_dataset,
            fod._snapshot_to_materialized_dataset_name(
                bson.ObjectId(), "unknown"
            ),
        )

    def _assert_funcs_readonly(self, mutators, data_obj):
        for mutator, num_req_args in mutators:
            func = getattr(data_obj, mutator)
            req_args = [unittest.mock.Mock() for _ in range(num_req_args)]
            self.assertRaises(ReadOnlyObjectException, func, *req_args)

    def _assert_class_funcs_readonly(self, mutators, base_class, data_obj):
        for mutator, num_req_args in mutators:
            func = getattr(base_class, mutator)
            req_args = [unittest.mock.Mock() for _ in range(num_req_args)]
            self.assertRaises(
                ReadOnlyObjectException, func, data_obj, *req_args
            )

    def _assert_setters_readonly(self, setters, data_obj):
        for setter in setters:
            self.assertRaises(
                ReadOnlyObjectException,
                setattr,
                data_obj,
                setter,
                unittest.mock.Mock(),
            )

    @drop_datasets
    def test_snapshot_is_readonly(self):
        dataset_name = self.test_dataset_snapshots.__name__
        snapshot_name = "my-snapshot"
        head_dataset = fo.Dataset(dataset_name)

        sample = fo.Sample("/blah.mp4", foo="bar")
        sample["detections"] = fo.Detections(
            detections=[fo.Detection(label="blah")]
        )
        frame = fo.Frame(
            quality=97.12,
            weather=fo.Classification(label="sunny"),
            objects=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat", bounding_box=[0.1, 0.1, 0.2, 0.2]
                    ),
                    fo.Detection(
                        label="dog", bounding_box=[0.7, 0.7, 0.2, 0.2]
                    ),
                ]
            ),
        )
        sample.frames[1] = frame

        head_dataset.add_sample(sample)

        _internal_snapshot_name = self._create_snapshot_dataset_magic(
            head_dataset, snapshot_name
        )

        snapshot = fo.load_dataset(dataset_name, snapshot=snapshot_name)
        view = snapshot.limit(10)

        # Collection
        collection_mutators = [
            ("tag_samples", 1),
            ("untag_samples", 1),
            ("tag_labels", 1),
            ("untag_labels", 1),
            ("split_labels", 2),
            ("merge_labels", 2),
            ("set_values", 2),
            ("set_label_values", 2),
            ("compute_metadata", 0),
            ("apply_model", 1),
            ("evaluate_regressions", 1),
            ("evaluate_classifications", 1),
            ("evaluate_detections", 1),
            ("evaluate_segmentations", 1),
            ("rename_evaluation", 2),
            ("delete_evaluation", 1),
            ("delete_evaluations", 0),
            ("rename_brain_run", 2),
            ("delete_brain_run", 1),
            ("delete_brain_runs", 0),
            ("annotate", 1),
            ("load_annotations", 1),
            ("rename_annotation_run", 2),
            ("delete_annotation_run", 1),
            ("delete_annotation_runs", 0),
            ("save_context", 0),
        ]
        for the_collection in (snapshot, view):
            self._assert_funcs_readonly(collection_mutators, the_collection)

        self.assertRaises(
            ReadOnlyObjectException, fo.core.collections.SaveContext, snapshot
        )

        self.assertRaises(
            ReadOnlyObjectException,
            snapshot.compute_embeddings,
            unittest.mock.Mock(),
            embeddings_field="field",
        )
        self.assertRaises(
            ReadOnlyObjectException,
            snapshot.compute_patch_embeddings,
            unittest.mock.Mock(),
            unittest.mock.Mock(),
            embeddings_field="field",
        )
        self.assertRaises(
            ReadOnlyObjectException, snapshot.to_frames, sample_frames=True
        )
        sort_similarity_stage = fo.core.stages.SortBySimilarity(
            [bson.ObjectId()], dist_field="something"
        )
        self.assertRaises(
            ReadOnlyObjectException, sort_similarity_stage.validate, snapshot
        )
        to_frames_stage = fo.core.stages.ToFrames(
            config={"sample_frames": True}
        )
        self.assertRaises(
            ReadOnlyObjectException, to_frames_stage.load_view, snapshot
        )

        # Allowed on collections
        snapshot.take(5).values("filepath")
        snapshot.shuffle().values("filepath")
        snapshot.sort_by("filepath").values("filepath")
        snapshot.create_index("foo")
        snapshot.drop_index("foo")

        # Dataset
        self.assertTrue(snapshot._readonly)
        dataset_setters = [
            "media_type",
            "name",
            "persistent",
            "tags",
            "description",
            "info",
            "app_config",
            "classes",
            "default_classes",
            "mask_targets",
            "default_mask_targets",
            "skeletons",
            "default_skeleton",
            "default_group_slice",
        ]
        self._assert_setters_readonly(dataset_setters, snapshot)

        dataset_mutators = [
            ("add_sample_field", 2),
            ("add_dynamic_sample_fields", 0),
            ("add_frame_field", 2),
            ("add_dynamic_frame_fields", 0),
            ("add_group_field", 1),
            ("rename_sample_field", 2),
            ("rename_sample_fields", 1),
            ("rename_frame_field", 2),
            ("rename_frame_fields", 1),
            ("clone_sample_field", 2),
            ("clone_sample_fields", 1),
            ("clone_frame_field", 2),
            ("clone_frame_fields", 1),
            ("clear_sample_field", 1),
            ("clear_sample_fields", 1),
            ("clear_frame_field", 1),
            ("clear_frame_fields", 1),
            ("delete_sample_field", 1),
            ("delete_sample_fields", 1),
            ("remove_dynamic_sample_field", 1),
            ("remove_dynamic_sample_fields", 1),
            ("delete_frame_field", 1),
            ("delete_frame_fields", 1),
            ("remove_dynamic_frame_field", 1),
            ("remove_dynamic_frame_fields", 1),
            ("add_group_slice", 2),
            ("rename_group_slice", 2),
            ("delete_group_slice", 1),
            ("add_sample", 1),
            ("add_samples", 1),
            ("add_collection", 1),
            ("merge_sample", 1),
            ("merge_samples", 1),
            ("delete_samples", 1),
            ("delete_frames", 1),
            ("delete_groups", 1),
            ("delete_labels", 0),
            ("remove_sample", 1),
            ("remove_samples", 1),
            ("save", 0),
            ("save_view", 2),
            ("update_saved_view_info", 2),
            ("delete_saved_view", 1),
            ("delete_saved_views", 0),
            ("clear", 0),
            ("clear_frames", 0),
            ("ensure_frames", 0),
            ("delete", 0),
            ("add_dir", 0),
            ("merge_dir", 0),
            ("add_archive", 1),
            ("merge_archive", 1),
            ("add_importer", 1),
            ("merge_importer", 1),
            ("add_images", 1),
            ("add_labeled_images", 2),
            ("add_images_dir", 1),
            ("add_images_patt", 1),
            ("ingest_images", 1),
            ("ingest_labeled_images", 2),
            ("add_videos", 1),
            ("add_labeled_videos", 2),
            ("add_videos_dir", 1),
            ("add_videos_patt", 1),
            ("ingest_videos", 1),
            ("ingest_labeled_videos", 2),
        ]
        self._assert_funcs_readonly(dataset_mutators, snapshot)

        # Dataset Iter samples and groups
        snapshot.iter_samples()
        self.assertRaises(
            ReadOnlyObjectException, snapshot.iter_samples, autosave=True
        )
        snapshot.iter_groups()
        self.assertRaises(
            ReadOnlyObjectException, snapshot.iter_groups, autosave=True
        )

        # View
        self.assertTrue(view._readonly)

        view_setters = [
            "tags",
            "description",
            "info",
            "app_config",
            "classes",
            "default_classes",
            "mask_targets",
            "default_mask_targets",
            "skeletons",
            "default_skeleton",
        ]
        self._assert_setters_readonly(view_setters, view)

        view_mutators = [
            ("clone_sample_field", 2),
            ("clone_sample_fields", 1),
            ("clone_frame_field", 2),
            ("clone_frame_fields", 1),
            ("clear_sample_field", 1),
            ("clear_sample_fields", 1),
            ("clear_frame_field", 1),
            ("clear_frame_fields", 1),
            ("clear", 0),
            ("clear_frames", 0),
            ("keep", 0),
            ("keep_fields", 0),
            ("keep_frames", 0),
            ("ensure_frames", 0),
            ("save", 0),
        ]
        self._assert_funcs_readonly(view_mutators, view)

        # View Iter samples and groups
        view.iter_samples()
        self.assertRaises(
            ReadOnlyObjectException, view.iter_samples, autosave=True
        )
        view.iter_groups()
        self.assertRaises(
            ReadOnlyObjectException, view.iter_groups, autosave=True
        )

        # Sample
        sample = snapshot.first()
        self.assertTrue(sample._readonly)
        self.assertRaises(
            ReadOnlyObjectException,
            sample.__setattr__,
            "foo",
            unittest.mock.Mock(),
        )
        self.assertRaises(
            ReadOnlyObjectException,
            sample.__setitem__,
            "foo2",
            unittest.mock.Mock(),
        )

        # SampleView
        sample_view = view.first()
        self.assertTrue(sample_view._readonly)

        sample_mixin_mutators = [
            ("set_field", 2),
            ("clear_field", 1),
            ("add_labels", 1),
            ("merge", 1),
            ("save", 0),
        ]
        for mixin_sample in (sample, sample_view):
            self._assert_funcs_readonly(sample_mixin_mutators, mixin_sample)

        # Runs
        runs_mutators = [
            ("update_run_key", 2),
            ("save_run_info", 1),
            ("update_run_config", 2),
            ("save_run_results", 2),
            ("delete_run", 1),
            ("delete_runs", 0),
        ]
        for sample_collection in (snapshot, view):
            self._assert_class_funcs_readonly(
                runs_mutators, focr.Run, sample_collection
            )

        run_config = fo.core.runs.RunConfig()
        run = fo.core.runs.Run(run_config)
        self.assertRaises(
            ReadOnlyObjectException, run.register_run, snapshot, "blah"
        )
        run_results = fo.core.runs.RunResults(
            snapshot, {}, "blah", backend="blah"
        )
        self.assertRaises(
            ReadOnlyObjectException,
            run_results.save,
        )
        self.assertRaises(
            ReadOnlyObjectException,
            run_results.save_config,
        )

        # Frames
        frames = sample.frames
        self.assertTrue(frames._readonly)

        frames_mutators = [
            ("add_frame", 2),
            ("delete_frame", 1),
            ("update", 1),
            ("merge", 1),
            ("clear", 0),
            ("save", 0),
            ("__delitem__", 1),
            ("__setitem__", 2),
        ]

        # FramesView
        frames_view = view.first().frames
        self.assertRaises(ReadOnlyObjectException, frames_view.save)
        self.assertRaises(
            ReadOnlyObjectException, frames_view.add_frame, 2, frame
        )

        for frames_obj in (frames, frames_view):
            self._assert_funcs_readonly(frames_mutators, frames_obj)

        # Frame
        frame = frames[1]
        self.assertTrue(frame._readonly)

        # FrameView
        frame_view = frames_view[1]
        self.assertTrue(frame_view._readonly)

        # DocumentView
        document_mutators = [
            ("set_field", 2),
            ("update_fields", 1),
            ("clear_field", 1),
            ("save", 0),
            ("merge", 1),
        ]
        for document_obj in (sample_view, frame_view, frame, frame_view):
            self._assert_funcs_readonly(document_mutators, document_obj)

        # Clips
        clips = snapshot.to_clips("frames.objects")
        clips_mutators = [
            ("set_values", 1),
            ("set_label_values", 1),
            ("save", 0),
            ("keep", 0),
            ("keep_fields", 0),
        ]
        self._assert_funcs_readonly(clips_mutators, clips)

        # Trajectories
        trajs = snapshot.to_trajectories("frames.objects")
        trajs_mutators = [
            ("set_values", 1),
            ("set_label_values", 1),
            ("save", 0),
            ("keep", 0),
            ("keep_fields", 0),
        ]
        self._assert_funcs_readonly(trajs_mutators, trajs)

    @drop_datasets
    def test_snapshot_patches_is_readonly(self):
        dataset_name = self.test_dataset_snapshots.__name__
        snapshot_name = "my-snapshot"
        head_dataset = fo.Dataset(dataset_name)

        sample = fo.Sample("/blah.jpg", foo="bar")
        sample["detections"] = fo.Detections(
            detections=[fo.Detection(label="blah")]
        )
        head_dataset.add_sample(sample)

        _internal_snapshot_name = self._create_snapshot_dataset_magic(
            head_dataset, snapshot_name
        )

        snapshot = fo.load_dataset(dataset_name, snapshot=snapshot_name)

        # Patches
        patches = snapshot.to_patches("detections")
        patches_mutators = [
            ("set_values", 1),
            ("set_label_values", 1),
            ("save", 0),
            ("keep", 0),
            ("keep_fields", 0),
        ]
        self._assert_funcs_readonly(patches_mutators, patches)
