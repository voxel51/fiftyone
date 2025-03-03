"""Test pymongo proxy command cursor automatic execution"""

import uuid

import pymongo
import pytest
from motor import motor_asyncio

import fiftyone.api.motor
import fiftyone.api.pymongo


@pytest.fixture(name="pymongo_database")
def fixture_pymongo_database() -> pymongo.MongoClient:
    """Pymongo client"""
    raise NotImplementedError("Requires a connection to a Mongo database")


@pytest.fixture(name="pymongo_proxy_database")
def fixture_pymongo_proxy_database() -> fiftyone.api.pymongo.MongoClient:
    """Pymongo proxy client"""
    raise NotImplementedError("Requires a connection to the API")


@pytest.fixture(name="motor_database")
def fixture_motor_database() -> motor_asyncio.AsyncIOMotorClient:
    """Motor client"""
    raise NotImplementedError("Requires a connection to a Mongo database")


@pytest.fixture(name="motor_proxy_database")
def fixture_motor_proxy_database() -> fiftyone.api.motor.AsyncIOMotorClient:
    """Motor proxy client"""
    raise NotImplementedError("Requires a connection to the API")


@pytest.mark.skip(
    reason="This is an integration test that requires a running API"
)
@pytest.mark.parametrize(
    ["output_pipeline", "output_collections"],
    [pytest.param(key, key, id=key) for key in ("merge", "out")],
    indirect=True,
)
class TestCursorAutomaticExecution:
    """Test automatic execution of command cursors with $merge and $out
    stages."""

    COLORS = ("red", "orange", "yellow", "green", "blue", "purple")

    @pytest.fixture(name="input_collections")
    def fixture_input_collections(
        self, pymongo_database, pymongo_proxy_database
    ):
        """The collections with the input data"""
        databases = (pymongo_database, pymongo_proxy_database)

        collection_name = f"colors-{str(uuid.uuid4())}"

        collections = []
        for database in databases:
            collections.append(database.get_collection(collection_name))
            collections[-1].insert_many(
                [
                    {"color": self.COLORS[i % len(self.COLORS)]}
                    for i in range(120)
                ]
            )

        yield tuple(collections)

        for database in databases:
            database.drop_collection(collection_name)

    @pytest.fixture(name="input_collection_name")
    def fixture_input_collection_name(self, input_collections):
        """The name of the input collections"""
        return input_collections[0].name

    @pytest.fixture(name="output_collections")
    def fixture_output_collections(self, request, input_collections):
        """The collections where data is output"""
        output_collection_name = f"{input_collections[0].name}-{request.param}"

        yield tuple(
            input_collection.database.get_collection(output_collection_name)
            for input_collection in input_collections
        )

        for input_collection in input_collections:
            input_collection.database.drop_collection(output_collection_name)

    @pytest.fixture(name="output_collection_name")
    def fixture_output_collection_name(self, output_collections):
        """The name of the output collections"""
        return output_collections[0].name

    @pytest.fixture(name="pipeline")
    def fixture_pipeline(self):
        """The initial pipeline that does not output to a collection"""

        return [{"$match": {"color": self.COLORS[0]}}]

    @pytest.fixture(name="output_pipeline")
    def fixture_output_pipeline(
        self, request, output_collection_name, pipeline
    ):
        """The combined pipeline that outputs to a collection"""

        return pipeline + [{f"${request.param}": output_collection_name}]

    def test_pymongo_automatic_run(
        self, input_collections, output_collections, pipeline, output_pipeline
    ):
        """Test cursor is automatically run on initialization, not
        iteration."""
        # Get the cursors using the pipeline.
        default_cursors = [
            collection.aggregate(pipeline) for collection in input_collections
        ]

        # Ensure each cursor yields documents and all cursors yield the same
        # amount of documents.
        counts = [sum(1 for _ in cursor) for cursor in default_cursors]
        assert all(count > 0 and count == counts[0] for count in counts)

        num_docs = counts[0]

        # Ensure the result collections are empty before creating the
        # cursor.
        assert all(
            collection.count_documents({}) == 0
            for collection in output_collections
        )

        # Get the cursors using the pipeline and extra stage.
        output_cursors = [
            collection.aggregate(output_pipeline)
            for collection in input_collections
        ]

        # Ensure the result collections have documents without
        # exhausting their cursors.
        assert all(
            collection.count_documents({}) == num_docs
            for collection in output_collections
        )

        # Ensure each cursor does not yield any documents.
        assert all(
            count == 0
            for count in [sum(1 for _ in cursor) for cursor in output_cursors]
        )

    @pytest.mark.asyncio
    async def test_motor_no_automatic_run(
        self,
        input_collections,
        output_collections,
        pipeline,
        output_pipeline,
        input_collection_name,
        motor_database,
        motor_proxy_database,
    ):
        """Test cursor is NOT automatically run on initialization, but instead
        on iteration."""

        # Get the cursors using the pipeline.
        default_cursors = [
            collection.aggregate(pipeline) for collection in input_collections
        ]

        # Ensure each cursor yields documents and all cursors yield the same
        # amount of documents.
        counts = [sum(1 for _ in cursor) for cursor in default_cursors]
        assert all(count > 0 and count == counts[0] for count in counts)

        num_docs = counts[0]

        # Ensure the result collections are empty before creating the
        # cursor.
        assert all(
            collection.count_documents({}) == 0
            for collection in output_collections
        )

        # Get the cursors using the pipeline and extra stage.
        output_cursors = [
            database.get_collection(input_collection_name).aggregate(
                output_pipeline
            )
            for database in (motor_database, motor_proxy_database)
        ]

        # Ensure the result collections have still are empty before iterating.
        assert all(
            collection.count_documents({}) == 0
            for collection in output_collections
        )

        # Ensure each cursor does not yield any documents.
        for cursor in output_cursors:
            count = 0
            async for _ in cursor:
                count += 1
            assert count == 0

        # Ensure the result collections have documents after exhausting their
        # cursors.
        assert all(
            collection.count_documents({}) == num_docs
            for collection in output_collections
        )
