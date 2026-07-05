"""
Unit tests for :mod:`fiftyone.utils.cvat`.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone.utils.cvat as fouc


class _FakeResponse(object):
    def __init__(self, data):
        self._data = data

    def json(self):
        return self._data


class _FakeCVATAPI(object):
    """A minimal stand-in for a CVAT API client that returns a canned
    ``tasks/{id}/data/meta`` response, so we can exercise
    :func:`fiftyone.utils.cvat._parse_task_metadata` without a live server.
    """

    def __init__(self, meta):
        self._meta = meta

    def task_data_meta_url(self, task_id):
        return "http://cvat.test/api/tasks/%s/data/meta" % task_id

    def get(self, url):
        return _FakeResponse(self._meta)


class CVATParseTaskMetadataTests(unittest.TestCase):
    def _run(self, meta, data_map, download_media=False, data_dir=None):
        task_filepaths = []
        ignored_filenames = []
        download_tasks = []
        cvat_id_map = fouc._parse_task_metadata(
            _FakeCVATAPI(meta),
            task_id=1,
            data_map=data_map,
            task_filepaths=task_filepaths,
            ignored_filenames=ignored_filenames,
            download_tasks=download_tasks,
            data_dir=data_dir,
            download_media=download_media,
        )
        return cvat_id_map, task_filepaths, ignored_filenames, download_tasks

    def test_no_deleted_frames(self):
        meta = {
            "start_frame": 0,
            "stop_frame": 2,
            "chunk_size": 1,
            "frames": [
                {"name": "a.jpg"},
                {"name": "b.jpg"},
                {"name": "c.jpg"},
            ],
        }
        data_map = {
            "a.jpg": "/data/a.jpg",
            "b.jpg": "/data/b.jpg",
            "c.jpg": "/data/c.jpg",
        }

        cvat_id_map, task_filepaths, ignored, _ = self._run(meta, data_map)

        # All frames are mapped, with frame ids matching their positions
        self.assertEqual(
            cvat_id_map,
            {"/data/a.jpg": 0, "/data/b.jpg": 1, "/data/c.jpg": 2},
        )
        self.assertEqual(
            sorted(task_filepaths),
            ["/data/a.jpg", "/data/b.jpg", "/data/c.jpg"],
        )
        self.assertEqual(ignored, [])

    def test_deleted_frames_are_skipped(self):
        # Frame 1 ("b.jpg") has been deleted in CVAT
        meta = {
            "start_frame": 0,
            "stop_frame": 2,
            "chunk_size": 1,
            "deleted_frames": [1],
            "frames": [
                {"name": "a.jpg"},
                {"name": "b.jpg"},
                {"name": "c.jpg"},
            ],
        }
        data_map = {
            "a.jpg": "/data/a.jpg",
            "b.jpg": "/data/b.jpg",
            "c.jpg": "/data/c.jpg",
        }

        cvat_id_map, task_filepaths, ignored, _ = self._run(meta, data_map)

        # The deleted frame must not be imported: its filepath is absent and
        # the surviving frames keep their original CVAT frame ids
        self.assertEqual(cvat_id_map, {"/data/a.jpg": 0, "/data/c.jpg": 2})
        self.assertEqual(
            sorted(task_filepaths), ["/data/a.jpg", "/data/c.jpg"]
        )
        self.assertNotIn("/data/b.jpg", task_filepaths)

        # A deleted frame is intentionally omitted, not a data-map miss, so it
        # should not be reported as an ignored (unmapped) filename
        self.assertEqual(ignored, [])

    def test_deleted_frames_not_downloaded(self):
        # Deleted media should never be queued for download
        meta = {
            "start_frame": 0,
            "stop_frame": 1,
            "chunk_size": 1,
            "deleted_frames": [0],
            "frames": [
                {"name": "gone.jpg"},
                {"name": "keep.jpg"},
            ],
        }

        _, task_filepaths, _, download_tasks = self._run(
            meta,
            data_map={},
            download_media=True,
            data_dir="/data",
        )

        queued = [task[3] for task in download_tasks]
        self.assertNotIn("/data/gone.jpg", queued)
        self.assertIn("/data/keep.jpg", queued)
        self.assertEqual(task_filepaths, ["/data/keep.jpg"])

    def test_missing_deleted_frames_key(self):
        # Responses without a ``deleted_frames`` key behave as before
        meta = {
            "frames": [{"name": "a.jpg"}, {"name": "b.jpg"}],
        }
        data_map = {"a.jpg": "/data/a.jpg", "b.jpg": "/data/b.jpg"}

        cvat_id_map, task_filepaths, ignored, _ = self._run(meta, data_map)

        self.assertEqual(cvat_id_map, {"/data/a.jpg": 0, "/data/b.jpg": 1})
        self.assertEqual(
            sorted(task_filepaths), ["/data/a.jpg", "/data/b.jpg"]
        )
        self.assertEqual(ignored, [])


if __name__ == "__main__":
    unittest.main()
