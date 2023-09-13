"""
Dataset snapshot management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import datetime
import enum
from typing import List, Optional

from fiftyone.api import errors
from fiftyone.management import connection, util


class DatasetSnapshotStatus(enum.Enum):
    """User role enum."""

    UNLOADED = "UNLOADED"
    LOADING = "LOADING"
    LOADED = "LOADED"


@dataclasses.dataclass
class SampleChangeSummary:
    total_samples: int
    num_samples_added: int
    num_samples_deleted: int
    num_samples_changed: int
    updated_at: Optional[datetime.datetime] = None

    def __post_init__(self):
        date_format = "%Y-%m-%dT%H:%M:%S.%f%z"
        if isinstance(self.updated_at, str):
            self.updated_at = datetime.datetime.strptime(
                self.updated_at, date_format
            )


@dataclasses.dataclass
class DatasetSnapshot:
    created_at: Optional[datetime.datetime]
    created_by: str
    description: Optional[str]
    id: str
    linear_change_summary: Optional[SampleChangeSummary]
    load_status: DatasetSnapshotStatus
    name: str
    slug: str

    def __post_init__(self):
        if isinstance(self.load_status, str):
            self.load_status = DatasetSnapshotStatus[self.load_status]

        if isinstance(self.linear_change_summary, dict):
            self.linear_change_summary = SampleChangeSummary(
                **self.linear_change_summary
            )

        if isinstance(self.created_by, dict):
            self.created_by = self.created_by.get("email")


_SNAPSHOT_FRAGMENT = """
fragment snapshotFrag on DatasetSnapshot {
    createdAt,
    createdBy {
        email,
    }
    description,
    id,
    linearChangeSummary {
        numSamplesAdded,
        numSamplesDeleted,
        numSamplesChanged,
        totalSamples
    },
    loadStatus,
    name,
    slug,
}
"""

_CALCULATE_LATEST_CHANGES_QUERY = """
mutation ($dataset: String!) {
    calculateDatasetLatestChanges(datasetIdentifier: $dataset) {
        numSamplesAdded,
        numSamplesDeleted,
        numSamplesChanged,
        totalSamples
        updatedAt
    }
}
"""


_CREATE_SNAPSHOT_QUERY = (
    _SNAPSHOT_FRAGMENT
    + """
mutation ($dataset: String!, $snapshot: String!, $description: String) {
    createDatasetSnapshot(
        datasetIdentifier: $dataset,
        snapshotName: $snapshot,
        description: $description
    ) {...snapshotFrag}
}
"""
)

_DELETE_SNAPSHOT_QUERY = """
mutation ($dataset: String!, $snapshot: String!){
    deleteDatasetSnapshot(
        datasetIdentifier: $dataset,
        snapshotName: $snapshot,
    )
}
"""

_REVERT_SNAPSHOT_QUERY = """
mutation ($dataset: String!, $snapshot: String!){
    revertDatasetToSnapshot(
        datasetIdentifier: $dataset,
        snapshotName: $snapshot,
    ) {id}
}
"""

_GET_LATEST_CHANGES_SUMMARY_QUERY = """
query($dataset: String!) {
    dataset(identifier: $dataset) {
        latestChanges {
            numSamplesAdded,
            numSamplesDeleted,
            numSamplesChanged,
            totalSamples,
            updatedAt
        }
    }
}
"""

_GET_SNAPSHOT_INFO_QUERY = (
    _SNAPSHOT_FRAGMENT
    + """
    query($dataset: String!, $snapshot: String!) {
        dataset(identifier: $dataset) {
            snapshot(snapshot: $snapshot) {
                ...snapshotFrag
            }
        }
    }
    """
)

_LIST_SNAPSHOTS_QUERY = """
query($dataset: String!, $after: String) {
    dataset (identifier: $dataset) {
        snapshotsConnection(first:2, after: $after) {
            pageInfo{
                hasNextPage
                endCursor
            }
            edges {
                node {
                    name
                }
            }
        }
    }
}
"""


MATERIALIZE_SNAPSHOT_TIMEOUT = 60 * 60  # 1 hour should be more than enough
DELETE_SNAPSHOT_TIMEOUT = 60 * 10  # 10 minutes
CALCULATE_CHANGES_TIMEOUT = 60


def calculate_dataset_latest_changes_summary(
    dataset_name: str,
) -> SampleChangeSummary:
    """Calculate change summary between recent snapshot and HEAD of dataset.

    Examples::

        import fiftyone.management as fom

        old = fom.calculate_dataset_latest_changes_summary(dataset.name)
        assert old == fom.get_dataset_latest_changes_summary(dataset.name)

        dataset.delete_samples(dataset.take(5))

        # Cached summary hasn't been updated
        assert old == fom.get_dataset_latest_changes_summary(dataset.name)

        new = fom.calculate_dataset_latest_changes_summary(dataset.name)
        assert new.updated_at > changes.updated_at

    Args:
        dataset_name: the dataset name

    Returns:
        Change summary between most recent snapshot and HEAD of this dataset.

    """
    client = connection.APIClientConnection().client
    try:
        result = client.post_graphql_request(
            query=_CALCULATE_LATEST_CHANGES_QUERY,
            variables={
                "dataset": dataset_name,
            },
            timeout=CALCULATE_CHANGES_TIMEOUT,
        )
    except errors.FiftyOneTeamsAPIError:
        raise
    except Exception as og_err:
        # With any unexpected error, check if we actually succeeded, if so,
        #   swallow the error
        try:
            change_summary = get_dataset_latest_changes_summary(dataset_name)
            now = datetime.datetime.now(datetime.timezone.utc)
            if not change_summary or (
                (now - change_summary.updated_at).total_seconds()
                > CALCULATE_CHANGES_TIMEOUT
            ):
                raise og_err
        except Exception:
            raise og_err
    change_summary = result["calculateDatasetLatestChanges"]
    return SampleChangeSummary(**util.camel_to_snake_container(change_summary))


def create_snapshot(
    dataset_name: str, snapshot_name: str, description: Optional[str] = None
) -> DatasetSnapshot:
    """Create and store a snapshot of the current state of ``dataset_name``.

    Snapshot name must be unique for the given dataset.

    .. note::

        Only users with ``MANAGE`` access can create a snapshot

    Examples::

        import fiftyone.management as fom

        snapshot_name = "v0.1"
        description = "Initial dataset snapshot"
        fom.create_snapshot(dataset.name, snapshot_name, description)

    Args:
        dataset_name: the dataset name
        snapshot_name: the name of the snapshot to create
        description (None): Optional description to attach to this snapshot
    """
    client = connection.APIClientConnection().client
    try:
        result = client.post_graphql_request(
            query=_CREATE_SNAPSHOT_QUERY,
            variables={
                "dataset": dataset_name,
                "snapshot": snapshot_name,
                "description": description,
            },
            timeout=MATERIALIZE_SNAPSHOT_TIMEOUT,
        )
        snapshot = result["createDatasetSnapshot"]
    except errors.FiftyOneTeamsAPIError:
        raise
    except Exception as og_err:
        # With any unexpected error, check if we actually succeeded, if so,
        #   swallow the error
        try:
            snapshot = get_snapshot_info(dataset_name, snapshot_name)
        except ValueError:
            raise og_err
    return DatasetSnapshot(**util.camel_to_snake_container(snapshot))


def delete_snapshot(dataset_name: str, snapshot_name: str):
    """Delete snapshot ``snapshot_name`` from dataset ``dataset_name``.

    .. note::

        Only users with ``MANAGE`` access can delete a snapshot.

    Examples::

        import fiftyone.management as fom

        snapshot_name = "v0.1"
        description = "Initial dataset snapshot"
        fom.create_snapshot(dataset.name, snapshot_name, description)

        # Some time later ...

        fom.delete_snapshot(dataset, snapshot_name)

    Args:
        dataset_name: the dataset name
        snapshot_name: the snapshot name
    """
    client = connection.APIClientConnection().client
    client.post_graphql_request(
        query=_DELETE_SNAPSHOT_QUERY,
        variables={
            "dataset": dataset_name,
            "snapshot": snapshot_name,
        },
        timeout=DELETE_SNAPSHOT_TIMEOUT,
    )


def get_dataset_latest_changes_summary(
    dataset_name: str,
) -> SampleChangeSummary:
    """Gets change summary between most recent snapshot and HEAD of dataset

    .. note::

        This summary is not continuously computed, the result of this function
        may be stale. Use :meth:`calculate_dataset_latest_changes_summary`
        to recalculate.

    Examples::

        import fiftyone.management as fom

        fom.get_dataset_latest_changes_summary(dataset.name)

    Args:
        dataset_name: the dataset name

    Returns:
        Change summary between most recent snapshot and HEAD of this dataset.
            Or ``None`` if no summary has been calculated yet.

    Raises:
        ValueError: if dataset doesn't exist or no access
    """
    client = connection.APIClientConnection().client

    dataset = client.post_graphql_request(
        query=_GET_LATEST_CHANGES_SUMMARY_QUERY,
        variables={"dataset": dataset_name},
    )["dataset"]
    if dataset is None:
        raise ValueError(f"Unknown dataset {dataset_name}")
    change_summary = dataset["latestChanges"]

    return (
        None
        if change_summary is None
        else SampleChangeSummary(
            **util.camel_to_snake_container(change_summary)
        )
    )


def get_snapshot_info(
    dataset_name: str, snapshot_name: str
) -> Optional[DatasetSnapshot]:
    """Gets information about the specified dataset snapshot, or ``None``
        if ``snapshot_name`` doesn't exist.

    Examples::

        import fiftyone.management as fom

        dataset = "quickstart"
        snapshot_name = "v0.1"

        fom.get_snapshot_info(dataset.name, snapshot_name)

    Args:
        dataset_name: the dataset name
        snapshot_name: the snapshot name

    Raises:
        ValueError: if dataset doesn't exist or no access
    """
    client = connection.APIClientConnection().client

    dataset = client.post_graphql_request(
        query=_GET_SNAPSHOT_INFO_QUERY,
        variables={"dataset": dataset_name, "snapshot": snapshot_name},
    )["dataset"]
    if dataset is None:
        raise ValueError(f"Unknown dataset {dataset_name}")
    snapshot = dataset["snapshot"]

    return (
        None
        if snapshot is None
        else DatasetSnapshot(**util.camel_to_snake_container(snapshot))
    )


def list_snapshots(dataset_name: str) -> List[str]:
    """Returns a list of all snapshots of a dataset in order of creation.

    Examples::

        import fiftyone.management as fom

        fom.list_snapshots(dataset.name)

    Args:
        dataset_name: the dataset name


    Raises:
        ValueError: if dataset doesn't exist or no access

    Returns:
        a list of :class:`DatasetSnapshot` instances
    """
    client = connection.APIClientConnection().client

    try:
        snapshots = client.post_graphql_connectioned_request(
            query=_LIST_SNAPSHOTS_QUERY,
            connection_property="dataset.snapshotsConnection",
            variables={"dataset": dataset_name},
        )
    except ValueError as e:
        # Looking for the specific error from post_graphql_connectioned_request
        #   that tells us dataset was not found, to add a more helpful message.
        #   Otherwise, just reraise the same error.
        if (
            len(e.args) > 0
            and isinstance(e.args[0], str)
            and e.args[0].startswith("No property dataset found")
        ):
            raise ValueError(f"Unknown dataset {dataset_name}") from e
        else:
            raise e

    return [snapshot["name"] for snapshot in snapshots]


def revert_dataset_to_snapshot(dataset_name: str, snapshot_name: str):
    """Revert dataset to a previous snapshot state.

    Reverts the current (HEAD) state of ``dataset_name`` to a previous
    state encapsulated by the snapshot ``snapshot_name``. All changes since
    then are lost. All snapshots created after this one will be deleted as well.

    If you are attempting to view the dataset at the point of a snapshot but
    not completely revert, you can do so with:

        snapshot = fo.load_dataset(dataset_name, snapshot=snapshot_name)

    .. note::

        Only users with ``MANAGE`` access can revert a dataset

    .. warning::

        This action is very destructive! All changes between ``snapshot_name``
        and the current HEAD state of ``dataset_name`` will be destroyed!
        Including all snapshots created after ``snapshot_name``.

    Examples::

        import fiftyone.management as fom

        snapshot_name = "v0.1"
        description = "Initial dataset snapshot"
        fom.create_snapshot(dataset.name, snapshot_name, description)

        # Oops we deleted everything!
        dataset.delete_samples(dataset.values("id"))

        # Phew!
        fom.revert_dataset_to_snapshot(dataset.name, snapshot_name)
        dataset.reload()
        assert len(dataset) > 0

    Args:
        dataset_name: the dataset name
        snapshot_name: the snapshot name
    """
    client = connection.APIClientConnection().client
    try:
        client.post_graphql_request(
            query=_REVERT_SNAPSHOT_QUERY,
            variables={
                "dataset": dataset_name,
                "snapshot": snapshot_name,
            },
            timeout=MATERIALIZE_SNAPSHOT_TIMEOUT,
        )
    except errors.FiftyOneTeamsAPIError:
        raise
    except Exception as og_err:
        # With any unexpected error, check if we actually succeeded, if so,
        #   swallow the error
        try:
            # Assume we succeeded if snapshot is now the latest and change
            # summary updated to be 0's
            snapshot_list = list_snapshots(dataset_name)
            if not snapshot_list or snapshot_list[-1] != snapshot_name:
                raise og_err

            change_summary = get_dataset_latest_changes_summary(dataset_name)
            now = datetime.datetime.now(datetime.timezone.utc)
            if (
                not change_summary
                or (
                    (now - change_summary.updated_at).total_seconds()
                    > CALCULATE_CHANGES_TIMEOUT
                )
                or not (
                    change_summary.num_samples_added
                    == change_summary.num_samples_changed
                    == change_summary.num_samples_deleted
                    == 0
                )
            ):
                raise og_err
        except ValueError:
            raise og_err
