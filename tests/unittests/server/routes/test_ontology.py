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
