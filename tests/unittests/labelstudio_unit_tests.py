"""Tests for the Label Studio vector labels codec."""

from types import SimpleNamespace

import pytest
from packaging import version

import fiftyone as fo
import fiftyone.utils.labelstudio as fouls


def _vector_result(vertices, closed=False):
    return {
        "original_width": 1920,
        "original_height": 1280,
        "image_rotation": 0,
        "from_name": "roads",
        "to_name": "image",
        "type": "vectorlabels",
        "value": {
            "vertices": vertices,
            "closed": closed,
            "vectorlabels": ["Road"],
        },
    }


class _FakeResponse(object):
    def __init__(self, release):
        self._release = release

    def json(self):
        return {"release": self._release}


class _FakeClient(object):
    def __init__(self, release):
        self._release = release

    def make_request(self, method, endpoint):
        assert method == "GET"
        assert endpoint == "/api/version"
        return _FakeResponse(self._release)


def _make_annotation_api(server_version):
    api = object.__new__(fouls.LabelStudioAnnotationAPI)
    api._client = _FakeClient(server_version)
    api._min_server_version = "1.5.0"
    api._min_polyline_server_version = "1.23.0"
    api._verify_server_version()
    return api


def test_verify_server_version_stores_parsed_release():
    api = _make_annotation_api("1.22.7")

    assert api._server_version == version.parse(  # pylint: disable=no-member
        "1.22.7"
    )


@pytest.mark.parametrize("label_type", ("polyline", "polylines"))
def test_verify_label_schema_rejects_polylines_before_1_23(label_type):
    api = _make_annotation_api("1.22.7")

    with pytest.raises(
        ValueError,
        match=r"installed version 1\.22\.7.*required version 1\.23\.0",
    ):
        api._verify_label_schema(  # pylint: disable=no-member
            {"roads": {"type": label_type}}
        )


@pytest.mark.parametrize("label_type", ("polyline", "polylines"))
def test_verify_label_schema_accepts_polylines_at_1_23(label_type):
    api = _make_annotation_api("1.23.0")

    api._verify_label_schema(  # pylint: disable=no-member
        {"roads": {"type": label_type}}
    )


@pytest.mark.parametrize("label_type", ("polygon", "polygons"))
def test_verify_label_schema_accepts_polygons_before_1_23(label_type):
    api = _make_annotation_api("1.22.7")

    api._verify_label_schema(  # pylint: disable=no-member
        {"buildings": {"type": label_type}}
    )


def test_init_project_validates_polylines_before_project_lookup():
    api = _make_annotation_api("1.22.7")

    def _unexpected_project_lookup():
        raise AssertionError("attempted project lookup")

    api._client.list_projects = _unexpected_project_lookup
    config = SimpleNamespace(
        project_name="Vector labels",
        label_schema={"roads": {"type": "polylines"}},
    )

    with pytest.raises(ValueError, match="1.23.0"):
        api._init_project(config, samples=None)


def test_export_to_label_studio_forwards_polyline_type():
    api = object.__new__(fouls.LabelStudioAnnotationAPI)
    label = fo.Polyline(
        label="Road",
        points=[[[0.1, 0.1], [0.2, 0.2]]],
        filled=True,
    )

    prediction = api._export_to_label_studio(label, "polylines")

    assert prediction["vectorlabels"] == ["Road"]


def test_generate_labeling_config_routes_polylines_to_vectorlabels():
    config = fouls.generate_labeling_config(
        {
            "roads": {"type": "polylines", "classes": ["Road"]},
            "buildings": {
                "type": "polygons",
                "classes": ["Building"],
            },
        },
        "image",
    )

    assert (
        '<VectorLabels name="roads" toName="image" closable="true" '
        'curves="false" skeleton="false">'
    ) in config
    assert '<Label value="Road"/>' in config
    assert '<PolygonLabels name="buildings" toName="image">' in config
    assert '<Label value="Building"/>' in config


@pytest.mark.parametrize("closed", [False, True])
def test_vectorlabels_round_trip_single_unfilled_path(closed):
    label = fo.Polyline(
        label="Road",
        points=[[[0.25, 0.3], [0.75, 0.7]]],
        closed=closed,
        filled=False,
    )
    full_result = {
        "original_width": 1920,
        "original_height": 1280,
        "image_rotation": 0,
        "from_name": "roads",
        "to_name": "image",
    }

    result = fouls.export_label_to_label_studio(
        label, label_type="polylines", full_result=full_result
    )[0]

    assert result["type"] == "vectorlabels"
    assert result["value"]["vertices"] == [
        {
            "id": result["value"]["vertices"][0]["id"],
            "x": 25.0,
            "y": 30.0,
            "prevPointId": None,
            "isBezier": False,
        },
        {
            "id": result["value"]["vertices"][1]["id"],
            "x": 75.0,
            "y": 70.0,
            "prevPointId": result["value"]["vertices"][0]["id"],
            "isBezier": False,
        },
    ]
    assert len({v["id"] for v in result["value"]["vertices"]}) == 2
    assert result["value"]["closed"] is closed
    assert result["value"]["vectorlabels"] == ["Road"]

    from_name, imported = fouls.import_label_studio_annotation(result)

    assert from_name == "roads"
    assert imported.label == "Road"
    assert imported.points == [[[0.25, 0.3], [0.75, 0.7]]]
    assert imported.closed is closed
    assert imported.filled is False


def test_vectorlabels_export_rejects_multiple_paths():
    label = fo.Polyline(
        label="Road",
        points=[[[0.1, 0.2], [0.2, 0.3]], [[0.7, 0.8], [0.8, 0.9]]],
        filled=False,
    )

    with pytest.raises(ValueError, match="exactly one path"):
        fouls.export_label_to_label_studio(label, label_type="polylines")


def test_vectorlabels_import_rejects_bezier_vertices():
    result = _vector_result(
        [
            {
                "id": "point-1",
                "x": 25.0,
                "y": 30.0,
                "prevPointId": None,
                "isBezier": True,
                "controlPoint1": {"x": 30.0, "y": 35.0},
                "controlPoint2": {"x": 40.0, "y": 45.0},
            }
        ]
    )

    with pytest.raises(ValueError, match="Bezier"):
        fouls.import_label_studio_annotation(result)


def test_vectorlabels_import_rejects_branching_vertices():
    result = _vector_result(
        [
            {
                "id": "point-1",
                "x": 25.0,
                "y": 30.0,
                "prevPointId": None,
                "isBezier": False,
            },
            {
                "id": "point-2",
                "x": 50.0,
                "y": 50.0,
                "prevPointId": "point-1",
                "isBezier": False,
            },
            {
                "id": "point-3",
                "x": 75.0,
                "y": 70.0,
                "prevPointId": "point-1",
                "isBezier": False,
            },
        ]
    )

    with pytest.raises(ValueError, match="linear"):
        fouls.import_label_studio_annotation(result)


def test_polyline_export_infers_type_from_filled_value():
    polygon = fo.Polyline(
        label="Building",
        points=[[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]],
        filled=True,
    )
    polyline = fo.Polyline(
        label="Road",
        points=[[[0.1, 0.1], [0.2, 0.2]]],
        filled=False,
    )

    assert fouls.export_label_to_label_studio(polygon)["polygonlabels"] == [
        "Building"
    ]
    assert fouls.export_label_to_label_studio(polyline)["vectorlabels"] == [
        "Road"
    ]


def test_polyline_export_uses_explicit_schema_type():
    label = fo.Polyline(
        label="Road",
        points=[[[0.1, 0.1], [0.2, 0.2]]],
        filled=True,
    )

    assert fouls.export_label_to_label_studio(label, label_type="polylines")[
        "vectorlabels"
    ] == ["Road"]


def test_polyline_export_rejects_ambiguous_filled_values():
    labels = fo.Polylines(
        polylines=[
            fo.Polyline(
                label="Building",
                points=[[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]],
                filled=True,
            ),
            fo.Polyline(
                label="Road",
                points=[[[0.1, 0.1], [0.2, 0.2]]],
                filled=False,
            ),
        ]
    )

    with pytest.raises(ValueError, match="mixed filled"):
        fouls.export_label_to_label_studio(labels)
