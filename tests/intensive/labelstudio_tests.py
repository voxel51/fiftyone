"""
Tests for the :mod:`fiftyone.utils.labelstudio` module.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
=======
"""
import os
import random

import numpy as np
import pytest

import fiftyone as fo
import fiftyone.zoo as foz
import fiftyone.utils.labelstudio as fouls
import fiftyone.core.labels as fol


@pytest.fixture()
def backend_config():
    config = fo.annotation_config.backends.get("labelstudio", {})
    return {
        "url": config.get(
            "url",
            os.getenv("FIFTYONE_LABELSTUDIO_URL", "http://localhost:8080"),
        ),
        "api_key": config.get(
            "api_key", os.getenv("FIFTYONE_LABELSTUDIO_API_KEY")
        ),
    }


@pytest.fixture()
def label_configs():
    cases = [
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "classification",
                        "classes": ["Adult content", "Weapons", "Violence"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <Choices name="some_random_field" toName="image" choice="single-radio">
    <Choice value="Adult content"/>
    <Choice value="Weapons"/>
    <Choice value="Violence"/>
  </Choices>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "classifications",
                        "classes": ["Boeing", "Airbus"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <Choices name="some_random_field" toName="image" choice="multiple">
    <Choice value="Boeing"/>
    <Choice value="Airbus"/>
  </Choices>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "detections",
                        "classes": ["Airplane", "Car"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <RectangleLabels name="some_random_field" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </RectangleLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "instances",
                        "classes": ["Airplane", "Car"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <BrushLabels name="some_random_field" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </BrushLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "polylines",
                        "classes": ["Airplane", "Car"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <PolygonLabels name="some_random_field" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </PolygonLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "polygons",
                        "classes": ["Airplane", "Car"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <PolygonLabels name="some_random_field" toName="image">
    <Label value="Airplane"/>
    <Label value="Car"/>
  </PolygonLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "keypoints",
                        "classes": ["Engine", "Tail"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <KeyPointLabels name="some_random_field" toName="image">
    <Label value="Engine"/>
    <Label value="Tail"/>
  </KeyPointLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "segmentation",
                        "classes": ["Planet", "Moonwalker"],
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <BrushLabels name="some_random_field" toName="image">
    <Label value="Planet"/>
    <Label value="Moonwalker"/>
  </BrushLabels>
</View>""",
        },
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "scalar",
                    }
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <Number name="some_random_field" toName="image"/>
</View>""",
        },
        # Multiple fields example. Also check that can have multiple of the same type
        {
            "input": {
                "media": "image",
                "label_schema": {
                    "some_random_field": {
                        "type": "segmentation",
                        "classes": ["Planet", "Moonwalker"],
                    },
                    "some_random_field2": {
                        "type": "classification",
                        "classes": ["PlanetClass", "MoonwalkerClass"],
                    },
                    "some_random_field3": {
                        "type": "classification",
                        "classes": ["PlanetClass2", "MoonwalkerClass2"],
                    },
                    "some_random_field4": {
                        "type": "detection",
                        "classes": ["PlanetDet", "MoonwalkerDet"],
                    },
                },
            },
            "output": """<View>
  <Image name="image" value="$image"/>
  <BrushLabels name="some_random_field" toName="image">
    <Label value="Planet"/>
    <Label value="Moonwalker"/>
  </BrushLabels>
  <Choices name="some_random_field2" toName="image" choice="single-radio">
    <Choice value="PlanetClass"/>
    <Choice value="MoonwalkerClass"/>
  </Choices>
  <Choices name="some_random_field3" toName="image" choice="single-radio">
    <Choice value="PlanetClass2"/>
    <Choice value="MoonwalkerClass2"/>
  </Choices>
  <RectangleLabels name="some_random_field4" toName="image">
    <Label value="PlanetDet"/>
    <Label value="MoonwalkerDet"/>
  </RectangleLabels>
</View>""",
        },
    ]
    return cases


def test_labelling_config(label_configs):
    for case in label_configs:
        generated = fouls.generate_labeling_config(**case["input"])
        assert generated.strip() == case["output"].strip()


@pytest.fixture()
def label_mappings():
    # TODO add a segmentation test by loading rle values
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
                "value": {"choices": ["Airbus", "Boeing"]},
                "from_name": "choice",
                "type": "choices",
            },
            "fiftyone": fo.Classifications(
                classifications=[
                    fo.Classification(label="Airbus"),
                    fo.Classification(label="Boeing"),
                ]
            ),
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
                    [
                        [0.29, 0.56],
                        [0.33, 0.8],
                        [0.43, 0.91],
                        [0.6, 0.9],
                        [0.59, 0.45],
                    ],
                ],
                filled=True,
                closed=True,
            ),
        },
        {
            "labelstudio": [
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 39.0,
                        "y": 81.0,
                        "width": 0.346,
                        "keypointlabels": ["Tail"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 33.3,
                        "y": 77.1,
                        "width": 0.346,
                        "keypointlabels": ["Tail"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 42.4,
                        "y": 89.4,
                        "width": 0.346,
                        "keypointlabels": ["Tail"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 42.4,
                        "y": 74.5,
                        "width": 0.346,
                        "keypointlabels": ["Tail"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
            ],
            "fiftyone": fol.Keypoint(
                label="Tail",
                points=[
                    (0.39, 0.81),
                    (0.333, 0.771),
                    (0.424, 0.894),
                    (0.424, 0.745),
                ],
            ),
        },
        {
            "labelstudio": [
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 39.0,
                        "y": 81.0,
                        "width": 0.346,
                        "keypointlabels": ["LEye"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 33.3,
                        "y": 77.1,
                        "width": 0.346,
                        "keypointlabels": ["LEye"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 42.4,
                        "y": 89.4,
                        "width": 0.346,
                        "keypointlabels": ["REye"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
                {
                    "original_width": 600,
                    "original_height": 403,
                    "image_rotation": 0,
                    "value": {
                        "x": 42.4,
                        "y": 74.5,
                        "width": 0.346,
                        "keypointlabels": ["REye"],
                    },
                    "from_name": "label",
                    "type": "keypointlabels",
                },
            ],
            "fiftyone": fol.Keypoints(
                keypoints=[
                    fol.Keypoint(
                        label="LEye",
                        points=[
                            (0.39, 0.81),
                            (0.333, 0.771),
                        ],
                    ),
                    fol.Keypoint(
                        label="REye",
                        points=[
                            (0.424, 0.894),
                            (0.424, 0.745),
                        ],
                    ),
                ]
            ),
        },
        {
            "labelstudio": {
                "value": {"number": 100},
                "from_name": "number",
                "type": "number",
            },
            "fiftyone": fo.Regression(value=100),
        },
    ]
    return cases


def test_import_labels(label_mappings):
    for case in label_mappings:
        label = fouls.import_label_studio_annotation(case["labelstudio"])[1]
        expected = case["fiftyone"]
        if isinstance(expected, (list, tuple)):
            for pair in zip(label, expected):
                _assert_labels_equal(*pair)
        else:
            _assert_labels_equal(label, expected)


def test_export_labels(label_mappings):
    for case in label_mappings:
        ls_prediction = fouls.export_label_to_label_studio(case["fiftyone"])
        expected = case["labelstudio"]

        if isinstance(expected, (list, tuple)):
            for pred, exp in zip(ls_prediction, expected):
                _assert_predictions_equal(pred, exp["value"])
        else:
            _assert_predictions_equal(ls_prediction, expected["value"])


@pytest.fixture()
def setup(backend_config):
    dataset = foz.load_zoo_dataset("quickstart").take(3).clone()
    anno_key = "new_key"
    label_field = "new_field"
    labels = ["Cat", "Bear", "Horse", "Dog", "Wolf", "Lion"]
    yield dataset, anno_key, label_field, labels
    res = dataset.load_annotation_results(anno_key, **backend_config)
    res.cleanup()
    fo.delete_dataset(dataset.name)


@pytest.mark.parametrize(
    "label_type",
    ["classification", "detections", "polylines", "keypoints", "scalar"],
)
def test_annotate_simple(backend_config, setup, label_type):
    dataset, anno_key, label_field, labels = setup
    label_field += f"-{label_type}"
    dataset.annotate(
        anno_key,
        label_field=label_field,
        project_name=f"labelstudio_{label_type}_tests",
        label_type=label_type,
        classes=labels if label_type != "scalar" else None,
        backend="labelstudio",
        **backend_config,
    )

    # create dummy prediction and convert to annotations
    dummy_predictions = _generate_dummy_predictions(
        label_type, labels, len(dataset)
    )
    _add_dummy_annotations(
        dataset, anno_key, dummy_predictions, backend_config
    )

    dataset.load_annotations(anno_key, cleanup=False, **backend_config)

    labelled = dataset.exists(label_field)
    assert len(labelled) == len(dummy_predictions)


def test_annotate_not_all(backend_config, setup):
    # check that we can load partially annotated data
    label_type = "classification"
    dataset, anno_key, label_field, labels = setup
    label_field += f"-{label_type}"
    dataset.annotate(
        anno_key,
        label_field=label_field,
        project_name=f"labelstudio_{label_type}_tests",
        label_type=label_type,
        classes=labels if label_type != "scalar" else None,
        backend="labelstudio",
        **backend_config,
    )

    # create dummy prediction and convert to annotations
    dummy_predictions = _generate_dummy_predictions(
        label_type, labels, len(dataset) - 1
    )
    _add_dummy_annotations(
        dataset, anno_key, dummy_predictions, backend_config
    )

    dataset.load_annotations(anno_key, cleanup=False, **backend_config)

    labelled = dataset.exists(label_field)
    assert len(labelled) == len(dummy_predictions)
    assert len(labelled) == len(dataset) - 1


def test_annotate_multiple_fields(backend_config, setup):
    # check that we can load partially annotated data
    dataset, anno_key, label_field, labels = setup
    label_schema = {
        "cls_field": {
            "type": "classification",
            "labels": ["yes", "no"],
            "classes": ["yes", "no"],
        },
        "det_field": {
            "type": "detections",
            "classes": ["obj"],
        },
    }

    dataset.annotate(
        anno_key,
        label_schema=label_schema,
        project_name=f"labelstudio_multi-field_tests",
        backend="labelstudio",
        **backend_config,
    )

    # create dummy prediction and convert to annotations
    dummy_predictions_cls = _generate_dummy_predictions(
        "classification", labels, len(dataset)
    )
    dummy_predictions_det = _generate_dummy_predictions(
        "detections", labels, len(dataset)
    )
    _add_dummy_annotations(
        dataset, anno_key, dummy_predictions_det, backend_config
    )
    dataset.load_annotations(anno_key, cleanup=False, **backend_config)
    labelled = dataset.exists("det_field")
    assert len(labelled) == len(dataset)
    # can't load them together, so do it one by one
    _add_dummy_annotations(
        dataset, anno_key, dummy_predictions_cls, backend_config
    )
    dataset.load_annotations(anno_key, cleanup=False, **backend_config)
    labelled = dataset.exists("cls_field")
    assert len(labelled) == len(dataset)


@pytest.mark.parametrize(
    "label_type", ["classification", "detections", "polylines", "keypoints"]
)
def test_annotate_with_predictions(backend_config, setup, label_type):
    dataset, anno_key, label_field, labels = setup
    label_field += f"-{label_type}"

    # add dummy labels
    for smp in dataset:
        smp[label_field] = _generate_dummy_labels(label_type, labels)
        smp.save()

    dataset.annotate(
        anno_key,
        label_field=label_field,
        project_name=f"labelstudio_{label_type}_tests",
        label_type=label_type,
        backend="labelstudio",
        **backend_config,
    )

    # test that project tasks have predictions
    res = dataset.load_annotation_results(anno_key, **backend_config)
    ls_project = _get_project(res)
    assert len(ls_project.tasks_ids) == len(dataset)
    assert ls_project.get_predictions_coverage()["undefined"] == 1.0

    # test that annotations can be loaded back in lieu of existing labels
    ls_project.create_annotations_from_predictions()
    dataset.load_annotations(anno_key, **backend_config)


def _assert_labels_equal(converted, expected):
    assert converted._cls == expected._cls
    if hasattr(expected, "label"):
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
    elif expected._cls == "Keypoint":
        np.testing.assert_allclose(
            converted.points, expected.points, atol=0.01, rtol=0.01
        )
    elif expected._cls == "Keypoints":
        for pair in zip(converted.keypoints, expected.keypoints):
            _assert_labels_equal(*pair)
    elif expected._cls == "Regression":
        assert expected.value == converted.value
    elif expected._cls == "Classifications":
        assert all(cls_obj.label for cls_obj in expected.classifications)
    else:
        raise NotImplementedError()


def _assert_predictions_equal(converted, expected):
    for k, v in expected.items():
        if isinstance(v, (int, float)):
            assert converted[k] - v <= (0.01 + v * 0.01)
        elif isinstance(v, (list, tuple)):
            if len(v) == 1 or isinstance(v[0], str):
                assert converted[k] == v
            else:
                np.testing.assert_allclose(
                    converted[k], v, atol=0.01, rtol=0.01
                )
        else:
            assert converted[k] == v


def _get_project(annotation_results):
    api = annotation_results.backend.connect_to_api()
    ls_project = api._client.get_project(annotation_results.project_id)
    return ls_project


def _add_dummy_annotations(dataset, anno_key, predictions, backend_config):
    res = dataset.load_annotation_results(anno_key, **backend_config)
    ls_project = _get_project(res)
    for task_id, pred in zip(res.uploaded_tasks.keys(), predictions):
        ls_project.create_prediction(
            task_id=task_id,
            result=pred,
        )
    ls_project.create_annotations_from_predictions()


def _generate_dummy_predictions(label_type, labels, n):
    if label_type == "classification":
        return [{"choices": [random.choice(labels)]} for _ in range(n)]
    elif label_type == "detections":
        return [
            {
                "x": random.randint(0, 50),
                "y": random.randint(0, 50),
                "width": random.randint(0, 50),
                "height": random.randint(0, 50),
                "rectanglelabels": [random.choice(labels)],
            }
            for _ in range(n)
        ]
    elif label_type == "polylines":
        return [
            {
                "points": (np.random.random((4, 2)) * 100).tolist(),
                "polygonlabels": [random.choice(labels)],
            }
            for _ in range(n)
        ]
    elif label_type == "keypoints":

        def generate_keypoint():
            label = random.choice(labels)
            return [
                {
                    "type": "keypointlabels",
                    "from_name": "new_field-keypoints",
                    "to_name": "image",
                    "value": {
                        "x": random.randint(0, 50),
                        "y": random.randint(0, 50),
                        "width": 0.34,
                        "keypointlabels": [label],
                    },
                }
                for _ in range(5)
            ]

        return [generate_keypoint() for _ in range(n)]
    elif label_type == "segmentation":
        raise NotImplementedError()
    elif label_type == "scalar":
        return [{"number": random.randint(0, 100)} for _ in range(n)]
    else:
        raise ValueError("Unknown label type")


def _generate_dummy_labels(label_type, labels):
    if label_type == "classification":
        return fo.Classification(label=random.choice(labels))
    elif label_type == "detections":
        rand_box = lambda: (np.random.random(4) / 2).tolist()
        detections = [
            fo.Detection(label=random.choice(labels), bounding_box=rand_box()),
            fo.Detection(label=random.choice(labels), bounding_box=rand_box()),
        ]
        return fo.Detections(detections=detections)
    elif label_type == "polylines":
        rand_points = lambda n: [np.random.random((n, 2)).tolist()]
        polylines = [
            fo.Polyline(label=random.choice(labels), points=rand_points(5)),
            fo.Polyline(label=random.choice(labels), points=rand_points(6)),
        ]
        return fo.Polylines(polylines=polylines)
    elif label_type == "keypoints":
        keypoints = [
            fo.Keypoint(
                label=random.choice(labels),
                points=np.random.random((5, 2)).tolist(),
            ),
            fo.Keypoint(
                label=random.choice(labels),
                points=np.random.random((4, 2)).tolist(),
            ),
        ]
        return fo.Keypoints(keypoints=keypoints)
    elif label_type == "segmentation":
        raise NotImplementedError()
    elif label_type == "scalar":
        return fo.Regression(value=random.randint(0, 100))
    else:
        raise ValueError("Unknown label type: {}".format(label_type))
