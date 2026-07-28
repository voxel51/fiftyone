"""
FiftyOne Server ontology route unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.exceptions import HTTPException

import fiftyone.core.odm as foo
from fiftyone.core.odm.ontology import OntologyDocument, OntologyType
import fiftyone.server.routes.ontology as foro


# Async test methods can't use the sync ``drop_collection`` decorator from
# ``tests/unittests/decorators.py`` (its wrapper would return the coroutine
# without awaiting, firing cleanup before the test body), so we drop the
# collection via an autouse fixture instead.
@pytest.fixture(autouse=True)
def _drop_ontologies():
    db = foo.get_db_conn()
    db.drop_collection("ontologies")
    yield
    db.drop_collection("ontologies")


@pytest.fixture(name="endpoint")
def fixture_endpoint():
    return foro.Ontologies(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="mock_request")
def fixture_mock_request():
    def _make(query_params=None):
        request = MagicMock()
        request.query_params = query_params or {}
        return request

    return _make


class TestOntologiesRoute:
    @pytest.mark.asyncio
    async def test_empty(self, endpoint, mock_request):
        response = await endpoint.get(mock_request())

        assert response.status_code == 200
        body = json.loads(response.body)
        assert body == {"ontologies": []}

    @pytest.mark.asyncio
    async def test_single_ontology(self, endpoint, mock_request):
        OntologyDocument(
            name="vehicle_damage", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()

        response = await endpoint.get(mock_request())

        body = json.loads(response.body)
        assert len(body["ontologies"]) == 1
        summary = body["ontologies"][0]
        assert summary["name"] == "vehicle_damage"
        assert summary["type"] == "annotation_ontology"
        assert summary["version"] == 1
        assert isinstance(summary["last_modified_at"], str)

    @pytest.mark.asyncio
    async def test_sort_by_last_modified_desc(self, endpoint, mock_request):
        base = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        first = OntologyDocument(
            name="first", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()
        first.modify(set__last_modified_at=base)
        second = OntologyDocument(
            name="second", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()
        second.modify(set__last_modified_at=base + timedelta(seconds=1))
        third = OntologyDocument(
            name="third", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()
        third.modify(set__last_modified_at=base + timedelta(seconds=2))

        response = await endpoint.get(mock_request())

        body = json.loads(response.body)
        names = [o["name"] for o in body["ontologies"]]
        assert names == ["third", "second", "first"]

    @pytest.mark.asyncio
    async def test_only_latest_version_per_name(self, endpoint, mock_request):
        doc = OntologyDocument(
            name="foo", type=OntologyType.ANNOTATION_ONTOLOGY
        )
        doc.save()
        for _ in range(2):
            doc.save()

        response = await endpoint.get(mock_request())

        body = json.loads(response.body)
        assert len(body["ontologies"]) == 1
        assert body["ontologies"][0]["version"] == 3

    @pytest.mark.asyncio
    async def test_type_filter(self, endpoint, mock_request):
        OntologyDocument(
            name="an_ann", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()
        OntologyDocument(name="a_tax", type=OntologyType.TAXONOMY).save()

        response = await endpoint.get(
            mock_request(query_params={"type": "annotation_ontology"})
        )

        body = json.loads(response.body)
        names = [o["name"] for o in body["ontologies"]]
        assert names == ["an_ann"]

    @pytest.mark.asyncio
    async def test_name_filter_exact(self, endpoint, mock_request):
        OntologyDocument(
            name="vehicle_damage", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()
        OntologyDocument(
            name="other_one", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()

        response = await endpoint.get(
            mock_request(query_params={"name": "vehicle_damage"})
        )

        body = json.loads(response.body)
        names = [o["name"] for o in body["ontologies"]]
        assert names == ["vehicle_damage"]

    @pytest.mark.asyncio
    async def test_name_filter_slug_normalized(self, endpoint, mock_request):
        # Saved as "Vehicle Damage" → slug is "vehicle-damage". Looking up
        # by any string that slugifies to the same value should match.
        OntologyDocument(
            name="Vehicle Damage", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()

        response = await endpoint.get(
            mock_request(query_params={"name": "vehicle.DAMAGE"})
        )

        body = json.loads(response.body)
        assert len(body["ontologies"]) == 1
        assert body["ontologies"][0]["name"] == "Vehicle Damage"

    @pytest.mark.asyncio
    async def test_name_filter_no_match(self, endpoint, mock_request):
        OntologyDocument(
            name="vehicle_damage", type=OntologyType.ANNOTATION_ONTOLOGY
        ).save()

        response = await endpoint.get(
            mock_request(query_params={"name": "not_there"})
        )

        body = json.loads(response.body)
        assert body == {"ontologies": []}


@pytest.fixture(name="taxonomy_endpoint")
def fixture_taxonomy_endpoint():
    return foro.OntologyTaxonomy(
        scope={"type": "http"}, receive=AsyncMock(), send=AsyncMock()
    )


@pytest.fixture(name="taxonomy_request")
def fixture_taxonomy_request():
    def _make(name, query_params=None):
        request = MagicMock()
        request.path_params = {"name": name}
        request.query_params = query_params or {}
        return request

    return _make


def _save_taxonomy(name, root_dict):
    """Saves a Taxonomy by name with the given root tree (a Node dict)."""
    from fiftyone.core.annotation.nodes import Node
    from fiftyone.core.ontology import Taxonomy

    Taxonomy(name=name, root=Node.from_dict(root_dict)).save()


class TestOntologyTaxonomyRoute:
    @pytest.mark.asyncio
    async def test_unknown_name_404(
        self, taxonomy_endpoint, taxonomy_request
    ):
        with pytest.raises(HTTPException) as exc:
            await taxonomy_endpoint.get(taxonomy_request("does_not_exist"))
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_non_taxonomy_404(
        self, taxonomy_endpoint, taxonomy_request
    ):
        from fiftyone.core.ontology import AnnotationOntology

        AnnotationOntology(name="some_ao").save()

        with pytest.raises(HTTPException) as exc:
            await taxonomy_endpoint.get(taxonomy_request("some_ao"))
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_full_tree(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes",
            {
                "name": "root",
                "values": [
                    {"name": "car"},
                    {"name": "truck"},
                ],
            },
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request("vehicle_classes")
        )

        body = json.loads(response.body)
        assert body["taxonomy"]["name"] == "vehicle_classes"
        assert body["taxonomy"]["type"] == "taxonomy"
        assert body["taxonomy"]["root"]["name"] == "root"
        child_names = [
            c["name"] for c in body["taxonomy"]["root"]["values"]
        ]
        assert child_names == ["car", "truck"]

    @pytest.mark.asyncio
    async def test_node_query_returns_subtree(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes",
            {
                "name": "root",
                "values": [
                    {
                        "name": "cars",
                        "values": [{"name": "sedan"}, {"name": "suv"}],
                    },
                    {"name": "trucks"},
                ],
            },
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request("vehicle_classes", query_params={"node": "cars"})
        )

        body = json.loads(response.body)
        # `root` is reframed at the requested node.
        assert body["taxonomy"]["root"]["name"] == "cars"
        names = [c["name"] for c in body["taxonomy"]["root"]["values"]]
        assert names == ["sedan", "suv"]

    @pytest.mark.asyncio
    async def test_unknown_node_404(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes", {"name": "root", "values": [{"name": "car"}]}
        )

        with pytest.raises(HTTPException) as exc:
            await taxonomy_endpoint.get(
                taxonomy_request(
                    "vehicle_classes", query_params={"node": "missing"}
                )
            )
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_depth_zero_returns_root_only(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes",
            {"name": "root", "values": [{"name": "car"}]},
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request(
                "vehicle_classes", query_params={"depth": "0"}
            )
        )

        body = json.loads(response.body)
        # had children → values=[] marks truncation
        assert body["taxonomy"]["root"]["values"] == []

    @pytest.mark.asyncio
    async def test_depth_one_returns_root_and_direct_children(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes",
            {
                "name": "root",
                "values": [
                    {
                        "name": "cars",
                        "values": [{"name": "sedan"}],
                    },
                ],
            },
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request(
                "vehicle_classes", query_params={"depth": "1"}
            )
        )

        body = json.loads(response.body)
        assert body["taxonomy"]["root"]["name"] == "root"
        cars = body["taxonomy"]["root"]["values"][0]
        assert cars["name"] == "cars"
        # depth=1 truncated below cars; cars had children so values=[]
        assert cars["values"] == []

    @pytest.mark.asyncio
    async def test_depth_truncated_leaf_has_no_values_key(
        self, taxonomy_endpoint, taxonomy_request
    ):
        # A real leaf at the truncation boundary keeps no ``values``
        # key (distinguishes it from a truncated branch).
        _save_taxonomy(
            "vehicle_classes",
            {"name": "root", "values": [{"name": "car"}]},
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request(
                "vehicle_classes", query_params={"depth": "1"}
            )
        )

        body = json.loads(response.body)
        car = body["taxonomy"]["root"]["values"][0]
        assert car["name"] == "car"
        assert "values" not in car

    @pytest.mark.asyncio
    async def test_node_and_depth_combined(
        self, taxonomy_endpoint, taxonomy_request
    ):
        _save_taxonomy(
            "vehicle_classes",
            {
                "name": "root",
                "values": [
                    {
                        "name": "cars",
                        "values": [
                            {
                                "name": "sedan",
                                "values": [{"name": "camry"}],
                            },
                        ],
                    },
                ],
            },
        )

        response = await taxonomy_endpoint.get(
            taxonomy_request(
                "vehicle_classes",
                query_params={"node": "cars", "depth": "1"},
            )
        )

        body = json.loads(response.body)
        # rooted at cars, one level below (sedan but not camry).
        assert body["taxonomy"]["root"]["name"] == "cars"
        sedan = body["taxonomy"]["root"]["values"][0]
        assert sedan["name"] == "sedan"
        assert sedan["values"] == []

    @pytest.mark.asyncio
    async def test_invalid_depth_400(
        self, taxonomy_endpoint, taxonomy_request
    ):
        with pytest.raises(HTTPException) as exc:
            await taxonomy_endpoint.get(
                taxonomy_request("x", query_params={"depth": "not_a_number"})
            )
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    async def test_negative_depth_400(
        self, taxonomy_endpoint, taxonomy_request
    ):
        with pytest.raises(HTTPException) as exc:
            await taxonomy_endpoint.get(
                taxonomy_request("x", query_params={"depth": "-1"})
            )
        assert exc.value.status_code == 400
