"""
Collection merge tests.

All of these tests are designed to be run manually via::

    pytest tests/intensive/merge_tests.py -s -k test_<name>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import pytest

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.zoo as foz
from fiftyone import ViewField as F


@pytest.fixture
def basedir():
    with etau.TempDir() as tmpdir:
        print(tmpdir)
        yield tmpdir


def test_merge_samples_image(basedir):
    images_dir = os.path.join(basedir, "merge_samples_image")
    label = "person"

    dataset = foz.load_zoo_dataset("quickstart").clone()

    dataset1 = dataset.clone()
    dataset2 = dataset.clone()
    dataset3 = dataset.clone()

    # Give `dataset2` new field names
    dataset2.rename_sample_field("ground_truth", "gt")

    # Give `dataset3` new image locations
    inpaths = dataset3.values("filepath")
    outpaths = [os.path.join(images_dir, os.path.basename(f)) for f in inpaths]
    for inpath, outpath in zip(inpaths, outpaths):
        etau.copy_file(inpath, outpath)

    dataset3.set_values("filepath", outpaths)

    # Only merge `person` labels
    view2 = dataset2.filter_labels("gt", F("label") == label)
    view3 = dataset3.filter_labels("ground_truth", F("label") == label)

    # Perform the merges
    dataset.merge_samples(view2)
    dataset.merge_samples(view3)

    # Check that schema is correct
    schema = dataset.get_field_schema()

    assert "ground_truth" in schema
    assert "gt" in schema

    #
    # `dataset` should contain:
    #   `view2` counts in its `gt` field
    #   `dataset1` + `view3` counts in its `ground_truth` field
    #

    dataset_counts = dataset.count_values("ground_truth.detections.label")
    dataset1_counts = dataset1.count_values("ground_truth.detections.label")
    view3_counts = view3.count_values("ground_truth.detections.label")

    assert dataset_counts[label] == (
        dataset1_counts[label] + view3_counts[label]
    )

    dataset_counts = dataset.count_values("gt.detections.label")
    view2_counts = view2.count_values("gt.detections.label")

    assert dataset_counts[label] == view2_counts[label]


def test_merge_samples_and_labels_image():
    dataset = foz.load_zoo_dataset("quickstart")

    dataset1 = dataset[:150].clone()

    dataset2 = dataset[50:].clone()
    dataset2.set_field(
        "ground_truth.detections.label",
        (F("label") == "airplane").if_else(F("label").upper(), F("label")),
    ).save()

    d1 = dataset1.clone()
    d1.merge_samples(dataset2)

    num_objects1 = d1.count("ground_truth.detections")
    num_objects1_ref = dataset.count("ground_truth.detections")
    assert num_objects1 == num_objects1_ref

    counts1 = d1.count_values("ground_truth.detections.label")
    counts1_ref1 = dataset1[:50].count_values("ground_truth.detections.label")
    counts1_ref2 = dataset2.count_values("ground_truth.detections.label")
    assert counts1["airplane"] == counts1_ref1["airplane"]
    assert counts1["AIRPLANE"] == counts1_ref2["AIRPLANE"]

    d2 = dataset1.clone()
    d2.merge_samples(dataset2, overwrite=False)

    num_objects2 = d2.count("ground_truth.detections")
    num_objects2_ref = dataset.count("ground_truth.detections")
    assert num_objects2 == num_objects2_ref

    counts2 = d2.count_values("ground_truth.detections.label")
    counts2_ref1 = dataset1.count_values("ground_truth.detections.label")
    counts2_ref2 = dataset2[100:].count_values("ground_truth.detections.label")
    assert counts2["airplane"] == counts2_ref1["airplane"]
    assert counts2["AIRPLANE"] == counts2_ref2["AIRPLANE"]


def test_merge_samples_video(basedir):
    videos_dir = os.path.join(basedir, "merge_samples_video")
    label = "vehicle"

    dataset = foz.load_zoo_dataset("quickstart-video").clone()

    dataset1 = dataset.clone()
    dataset2 = dataset.clone()
    dataset3 = dataset.clone()

    # Give `dataset2` new field names
    dataset2.rename_frame_field("detections", "det")

    # Give `dataset3` new video locations
    inpaths = dataset3.values("filepath")
    outpaths = [os.path.join(videos_dir, os.path.basename(f)) for f in inpaths]
    for inpath, outpath in zip(inpaths, outpaths):
        etau.copy_file(inpath, outpath)

    dataset3.set_values("filepath", outpaths)

    # Only merge `vehicle` labels
    view2 = dataset2.filter_labels("frames.det", F("label") == label)
    view3 = dataset3.filter_labels("frames.detections", F("label") == label)

    # Perform the merges
    dataset.merge_samples(view2)
    dataset.merge_samples(view3)

    # Check that schema is correct
    schema = dataset.get_frame_field_schema()

    assert "detections" in schema
    assert "det" in schema

    #
    # `dataset` should contain:
    #   `view2` counts in its `det` field
    #   `dataset1` + `view3` counts in its `detections` field
    #

    dataset_counts = dataset.count_values("frames.detections.detections.label")
    dataset1_counts = dataset1.count_values(
        "frames.detections.detections.label"
    )
    view3_counts = view3.count_values("frames.detections.detections.label")

    assert dataset_counts[label] == (
        dataset1_counts[label] + view3_counts[label]
    )

    dataset_counts = dataset.count_values("frames.det.detections.label")
    view2_counts = view2.count_values("frames.det.detections.label")

    assert dataset_counts[label] == view2_counts[label]


def test_merge_samples_and_labels_video():
    dataset = foz.load_zoo_dataset("quickstart-video").limit(3)

    dataset1 = dataset[:2].clone()

    dataset2 = dataset[1:].clone()
    dataset2.set_field(
        "frames.detections.detections.label",
        (F("label") == "vehicle").if_else(F("label").upper(), F("label")),
    ).save()

    d1 = dataset1.clone()
    d1.merge_samples(dataset2)

    num_objects1 = d1.count("frames.detections.detections")
    num_objects1_ref = dataset.count("frames.detections.detections")
    assert num_objects1 == num_objects1_ref

    counts1 = d1.count_values("frames.detections.detections.label")
    counts1_ref1 = dataset1[:1].count_values(
        "frames.detections.detections.label"
    )
    counts1_ref2 = dataset2.count_values("frames.detections.detections.label")
    assert counts1["vehicle"] == counts1_ref1["vehicle"]
    assert counts1["VEHICLE"] == counts1_ref2["VEHICLE"]

    d2 = dataset1.clone()
    d2.merge_samples(dataset2, overwrite=False)

    num_objects2 = d2.count("frames.detections.detections")
    num_objects2_ref = dataset.count("frames.detections.detections")
    assert num_objects2 == num_objects2_ref

    counts2 = d2.count_values("frames.detections.detections.label")
    counts2_ref1 = dataset1.count_values("frames.detections.detections.label")
    counts2_ref2 = dataset2[1:].count_values(
        "frames.detections.detections.label"
    )
    assert counts2["vehicle"] == counts2_ref1["vehicle"]
    assert counts2["VEHICLE"] == counts2_ref2["VEHICLE"]


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    pytest.main([__file__])
