"""
Utils tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import numpy as np
import pytest

import eta.core.utils as etau
import eta.core.video as etav

import fiftyone as fo
import fiftyone.utils.image as foui
import fiftyone.utils.video as fouv


@pytest.fixture
def tmpdir():
    with etau.TempDir() as _tmpdir:
        yield _tmpdir


def _write_image(image_path, size):
    img = np.random.randint(255, size=size + (3,), dtype=np.uint8)
    foui.write(img, image_path)


def _write_video(video_path, fps, size, num_frames):
    frame_size = (size[1], size[0])
    with etav.FFmpegVideoWriter(video_path, fps, frame_size) as writer:
        for _ in range(num_frames):
            img = np.random.randint(255, size=size + (3,), dtype=np.uint8)
            writer.write(img)


def _make_dataset(source_path, dataset_dir, num_samples):
    ext = os.path.splitext(source_path)[1]

    samples = []
    for idx in range(num_samples):
        filepath = os.path.join(dataset_dir, "%06d%s" % (idx, ext))
        etau.copy_file(source_path, filepath)
        samples.append(fo.Sample(filepath=filepath))

    dataset = fo.Dataset()
    dataset.add_samples(samples)
    return dataset


def test_compute_image_metadata(tmpdir):
    image_path = os.path.join(tmpdir, "image.png")
    dataset_dir = os.path.join(tmpdir, "images")

    _height = 720
    _width = 1280

    _write_image(image_path, size=(_height, _width))
    dataset = _make_dataset(image_path, dataset_dir, num_samples=100)

    sample = dataset.first()
    assert sample.metadata is None

    dataset.compute_metadata()
    assert sample.metadata.height == _height
    assert sample.metadata.width == _width

    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.height == _height
    assert sample.metadata.width == _width

    dataset.clear_sample_field("metadata")
    assert sample.metadata is None

    dataset.compute_metadata(num_workers=1)
    assert sample.metadata.height == _height
    assert sample.metadata.width == _width


def test_compute_video_metadata(tmpdir):
    video_path = os.path.join(tmpdir, "video.mp4")
    dataset_dir = os.path.join(tmpdir, "videos")

    _height = 720
    _width = 1280

    _write_video(video_path, fps=5, size=(_height, _width), num_frames=30)
    dataset = _make_dataset(video_path, dataset_dir, num_samples=10)

    sample = dataset.first()
    assert sample.metadata is None

    dataset.compute_metadata()
    assert sample.metadata.frame_height == _height
    assert sample.metadata.frame_width == _width

    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.frame_height == _height
    assert sample.metadata.frame_width == _width

    dataset.clear_sample_field("metadata")
    assert sample.metadata is None

    dataset.compute_metadata(num_workers=1)
    assert sample.metadata.frame_height == _height
    assert sample.metadata.frame_width == _width


def test_transform_images(tmpdir):
    image_path = os.path.join(tmpdir, "image.png")
    dataset_dir = os.path.join(tmpdir, "images")

    _write_image(image_path, size=(720, 1280))
    dataset = _make_dataset(image_path, dataset_dir, num_samples=100)

    sample = dataset.first()
    assert sample.filepath.endswith(".png")

    foui.reencode_images(dataset, ext=".jpg")
    assert sample.filepath.endswith(".jpg")

    foui.transform_images(dataset, ext=".jpg", force_reencode=True)
    assert sample.filepath.endswith(".jpg")

    foui.transform_images(dataset, max_size=(256, 256), num_workers=1)
    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.height <= 256
    assert sample.metadata.width <= 256

    foui.transform_images(dataset, min_size=(512, 512), delete_originals=True)
    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.height >= 512
    assert sample.metadata.width >= 512


def test_transform_videos(tmpdir):
    video_path = os.path.join(tmpdir, "video.avi")
    dataset_dir = os.path.join(tmpdir, "videos")

    _write_video(video_path, fps=5, size=(720, 1280), num_frames=30)
    dataset = _make_dataset(video_path, dataset_dir, num_samples=2)

    sample = dataset.first()
    assert sample.filepath.endswith(".avi")

    fouv.reencode_videos(dataset)
    assert sample.filepath.endswith(".mp4")

    fouv.transform_videos(dataset, reencode=True, force_reencode=True)
    assert sample.filepath.endswith(".mp4")

    fouv.transform_videos(dataset, max_size=(256, 256))
    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.frame_height <= 256
    assert sample.metadata.frame_width <= 256

    fouv.transform_videos(dataset, min_size=(512, 512), delete_originals=True)
    dataset.compute_metadata(overwrite=True)
    assert sample.metadata.frame_height >= 512
    assert sample.metadata.frame_width >= 512


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    pytest.main([__file__])
