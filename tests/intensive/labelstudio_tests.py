import os
import random

import numpy as np
import pytest

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.utils.labelstudio as fouls


@pytest.fixture()
def backend_config():
    return {
        "backend": "labelstudio",
        "url": os.getenv("LABELSTUDIO_URL", "http://localhost:8080"),
        "api_key": os.getenv("LABELSTUDIO_TOKEN"),
    }


@pytest.fixture()
def label_configs():
    cases = [
        {
            "input": {
                "media": "image",
                "label_type": "polylines",
                "labels": ["Airplane", "Car"],
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <PolygonLabels name="label" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </PolygonLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_type": "detections",
                "labels": ["Airplane", "Car"],
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="label" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </RectangleLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_type": "classification",
                "labels": ["Adult content", "Weapons", "Violence"],
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <Choices name="choice" toName="image">
    <Choice value="Adult content"/>
    <Choice value="Weapons"/>
    <Choice value="Violence"/>
  </Choices>
</View>""",
        },
        {
            "input": {
                "media": "video",
                "label_type": "classification",
                "labels": ["Blurry", "Sharp"],
            },
            "output": """<View>
  <Video name="video" value="$video"/>
  <Choices name="choice" toName="video">
    <Choice value="Blurry"/>
    <Choice value="Sharp"/>
  </Choices>
</View>""",
        },
    ]
    return cases


@pytest.fixture()
def label_mappings():
    cases = [
        {
            "labelstudio": {
                "value": {"choices": ["Airbus"]},
                "from_name": "choice",
                "type": "choices",
            },
            "fiftyone": fo.Classification(label="Airbus"),
        },
        {
            "labelstudio": {
                "image_rotation": 0,
                "value": {
                    "x": 5.0,
                    "y": 15.0,
                    "width": 32.0,
                    "height": 39.0,
                    "rotation": 0,
                    "rectanglelabels": ["Airplane"],
                },
                "type": "rectanglelabels",
            },
            "fiftyone": fo.Detection(
                label="Airplane", bounding_box=[0.05, 0.15, 0.32, 0.39]
            ),
        },
        {
            "labelstudio": {
                "original_width": 600,
                "original_height": 403,
                "image_rotation": 0,
                "value": {
                    "x": 67.0,
                    "y": 17.0,
                    "width": 29.0,
                    "height": 49.0,
                    "rotation": 0,
                    "rectanglelabels": ["Car"],
                },
                "id": "inPz4zB84L",
                "from_name": "label",
                "to_name": "image",
                "type": "rectanglelabels",
            },
            "fiftyone": fo.Detection(
                label="Car", bounding_box=[0.67, 0.17, 0.29, 0.49]
            ),
        },
        {
            "labelstudio": {
                "value": {
                    "points": [
                        [29.0, 56.0],
                        [33.0, 80.0],
                        [43.0, 91.0],
                        [60.0, 90.0],
                        [59.0, 45.0],
                    ],
                    "polygonlabels": ["Car"],
                },
                "original_width": 600,
                "original_height": 403,
                "image_rotation": 0,
                "id": "d3PbabEFY0",
                "from_name": "label",
                "to_name": "image",
                "type": "polygonlabels",
            },
            "fiftyone": fo.Polyline(
                label="Car",
                points=[
                    [[0.29, 0.56], [0.33, 0.8]],
                    [[0.33, 0.8], [0.43, 0.91]],
                    [[0.43, 0.91], [0.6, 0.9]],
                    [[0.6, 0.9], [0.59, 0.45]],
                ],
                filled=True,
                closed=True,
            ),
        },
    ]
    return cases


@pytest.fixture()
def setup(backend_config):
    dataset = foz.load_zoo_dataset("quickstart").take(2).clone()
    anno_key = "new_key"
    label_field = "new_field"
    labels = ["Cat", "Bear", "Horse"]
    yield dataset, anno_key, label_field, labels
    res = dataset.load_annotation_results(anno_key, **backend_config)
    res.cleanup()
    fo.delete_dataset(dataset.name)


def test_labelling_config(label_configs):
    for case in label_configs:
        generated = fouls.generate_labelling_config(**case["input"])
        assert generated.strip() == case["output"].strip()


def test_import_labels(label_mappings):
    for case in label_mappings:
        converted = fouls.import_labelstudio_annotation(case["labelstudio"])
        expected = case["fiftyone"]
        _assert_labels_equal(converted, expected)


def test_export_labels(label_mappings):
    for case in label_mappings:
        converted = fouls.export_label_to_labelstudio(case["fiftyone"])
        _assert_predictions_equal(converted, case["labelstudio"]["value"])


@pytest.mark.parametrize("label_type",
                         ["classification", "detections", "polylines"])
def test_annotate_simple(backend_config, setup, label_type):
    dataset, anno_key, label_field, labels = setup
    label_field += f"-{label_type}"
    dataset.annotate(
        anno_key,
        label_field=label_field,
        project_name=f"labelstudio_{label_type}_tests",
        label_type=label_type,
        classes=labels,
        **backend_config
    )

    # create dummy prediction and convert to annotations
    dummy_predictions = _generate_dummy_predictions(label_type, labels,
                                                    len(dataset))
    _add_dummy_annotations(dataset, anno_key, dummy_predictions)

    dataset.load_annotations(
        anno_key, cleanup=False, **backend_config
    )

    labelled = dataset.exists(label_field)
    assert len(labelled) == len(dummy_predictions)


def _assert_labels_equal(converted, expected):
    assert converted._cls == expected._cls
    assert converted.label == expected.label
    if expected._cls == "Classification":
        assert True
    elif expected._cls == "Detection":
        np.testing.assert_allclose(
            converted.bounding_box, expected.bounding_box, atol=0.01, rtol=0.01
        )
    elif expected._cls == "Polyline":
        np.testing.assert_allclose(
            converted.points, expected.points, atol=0.01, rtol=0.01
        )
        assert converted.closed == expected.closed
        assert converted.filled == expected.filled
    else:
        raise NotImplementedError()


def _assert_predictions_equal(converted, expected):
    for k, v in expected.items():
        if isinstance(v, (int, float)):
            assert converted[k] - v <= (0.01 + v * 0.01)
        elif isinstance(v, (list, tuple)):
            if len(v) == 1:
                assert converted[k] == v
            else:
                np.testing.assert_allclose(
                    converted[k], v, atol=0.01, rtol=0.01
                )
        else:
            assert converted[k] == v


def _add_dummy_annotations(dataset, anno_key, predictions):
    res = dataset.load_annotation_results(anno_key)
    ls_project = res.backend.connect_to_api().get_project(res.project_id)
    for task_id, pred in zip(res.uploaded_tasks.keys(), predictions):
        ls_project.create_prediction(
            task_id=task_id,
            result=pred,
        )
    ls_project.create_annotations_from_predictions()


def _generate_dummy_predictions(label_type, labels, n):
    if label_type == "classification":
        return [{
            "choices": [random.choice(labels)]
        } for _ in range(n)]
    elif label_type == "detections":
        return [{
            "x": random.randint(0, 50),
            "y": random.randint(0, 50),
            "width": random.randint(0, 50),
            "height": random.randint(0, 50),
            "rectanglelabels": [random.choice(labels)]
        } for _ in range(n)]
    elif label_type == "polylines":
        return [{
            "points": (np.random.randn(4, 2, ) * 100).tolist(),
            "polygonlabels": [random.choice(labels)]
        } for _ in range(n)]
    else:
        raise NotImplementedError()
