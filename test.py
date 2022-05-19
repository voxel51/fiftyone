import pytest

import fiftyone as fo

from pymongo import MongoClient

DEFAULT_DATASET_NAME = "autosave-dataset"
VIDEO_DATASET_NAME = "autosave-dataset-video"


@pytest.fixture()
def default_dataset():
    dataset = fo.Dataset(DEFAULT_DATASET_NAME, persistent=True)
    dataset.add_samples([fo.Sample("some/path/to/file") for _ in range(10)])
    try:
        yield dataset
    finally:
        fo.delete_dataset(DEFAULT_DATASET_NAME)


@pytest.fixture()
def video_dataset():
    dataset = fo.Dataset(VIDEO_DATASET_NAME, persistent=True)
    for _ in range(10):
        sample = fo.Sample(filepath="video.mp4")
        for i in range(1, 11):
            sample.frames[i] = fo.Frame()
        dataset.add_sample(sample)
    try:
        yield dataset
    finally:
        fo.delete_dataset(VIDEO_DATASET_NAME)


@pytest.fixture()
def mongo_db():
    return MongoClient().fiftyone


@pytest.fixture()
def default_dataset_samples_collection(mongo_db):
    dataset = mongo_db.datasets.find_one({"name": DEFAULT_DATASET_NAME})
    return mongo_db[dataset["sample_collection_name"]]


@pytest.fixture()
def video_dataset_samples_collection(mongo_db):
    dataset = mongo_db.datasets.find_one({"name": VIDEO_DATASET_NAME})
    return mongo_db[dataset["sample_collection_name"]]


@pytest.fixture()
def video_dataset_frames_collection(mongo_db):
    dataset = mongo_db.datasets.find_one({"name": VIDEO_DATASET_NAME})
    return mongo_db[dataset["frame_collection_name"]]


def test_autosave_with_dataset(
    default_dataset, default_dataset_samples_collection
):
    key, value = "hello", "dataset"
    for sample in default_dataset.iter_samples(autosave=True):
        sample[key] = value

    for doc in default_dataset_samples_collection.find({}):
        assert doc[key] == value


def test_autosave_with_dataset_views(
    default_dataset, default_dataset_samples_collection
):
    key, value = "helloselect", "datasetviewselect"
    for sample in default_dataset.select_fields().iter_samples(autosave=True):
        sample[key] = value

    for doc in default_dataset_samples_collection.find({}):
        assert doc[key] == value

    key, value = "helloindex", "datasetviewindex"
    for sample in default_dataset[:100].iter_samples(autosave=True):
        sample[key] = value

    for doc in default_dataset_samples_collection.find({}):
        assert doc[key] == value


def test_autosave_with_video_dataset(
    video_dataset,
    video_dataset_samples_collection,
    video_dataset_frames_collection,
):
    key, sample_value, frame_value = "hello", "sample", "frame"

    for sample in video_dataset.iter_samples(autosave=True):
        sample[key] = sample_value
        for frame in sample.frames.values():
            frame[key] = frame_value

    for doc in video_dataset_samples_collection.find({}):
        assert doc[key] == sample_value

    for doc in video_dataset_frames_collection.find({}):
        print(doc)
        assert doc[key] == frame_value
