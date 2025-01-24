"""
Session tests.

You must run these tests interactively as follows::

    pytest tests/intensive/session_tests.py -s -k <test_case>

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
import fiftyone.zoo as foz


def test_select_samples():
    dataset = foz.load_zoo_dataset("quickstart").clone()
    dataset.untag_samples("validation")

    session = fo.launch_app(dataset)

    # Select `n` samples in the App
    input("Press enter after selecting samples...")

    print(len(session.selected))
    # n

    session.tag_selected_samples("test")

    print(dataset.count_sample_tags())
    # {'test': n}

    session.untag_selected_samples("test")

    print(dataset.count_sample_tags())
    # {}

    session.tag_selected_samples("test")
    session.clear_selected()

    print(len(session.selected))
    # 0

    session.select_samples(tags="test")

    print(len(session.selected))
    # n


def test_select_labels():
    dataset = foz.load_zoo_dataset("quickstart").clone()
    dataset.untag_samples("validation")

    session = fo.launch_app(dataset)

    # Select `n` samples in the App
    input("Press enter after selecting labels...")

    print(len(session.selected_labels))
    # n

    session.tag_selected_labels("test")

    print(dataset.count_label_tags())
    # {'test': n}

    session.untag_selected_labels("test")

    print(dataset.count_label_tags())
    # {}

    session.tag_selected_labels("test")
    session.clear_selected_labels()

    print(len(session.selected_labels))
    # 0

    session.select_labels(tags="test")

    print(len(session.selected_labels))
    # n


def test_select_frame_labels():
    dataset = foz.load_zoo_dataset("quickstart-video")

    session = fo.launch_app(dataset)

    ids = [
        dataset.first().frames.first().detections.detections[0].id,
        dataset.last().frames[120].detections.detections[-1].id,
    ]

    tag_counts = dataset.count_label_tags()
    assert tag_counts == {}

    view = dataset.select_labels(ids=ids)
    count = view.count("frames.detections.detections")
    assert count == 2

    tag_counts = dataset.count_label_tags()
    assert tag_counts == {}

    view.tag_labels("test")

    tag_counts = dataset.count_label_tags()
    assert tag_counts == {"test": 2}

    selected_labels = session.selected_labels
    assert selected_labels == []

    session.select_labels(tags="test")

    num_selected_labels = len(session.selected_labels)
    assert num_selected_labels == 2


if __name__ == "__main__":
    fo.config.show_progress_bars = True
    unittest.main(verbosity=2)
