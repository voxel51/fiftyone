"""
Dataset snapshot management.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import dataclasses
import datetime
import enum
from typing import Any, Dict, List, Optional

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


_CREATE_SNAPSHOT_QUERY = (
    _SNAPSHOT_FRAGMENT
    + """
mutation ($dataset: String!, $snapshot: String!, $description: String){
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

_LIST_SNAPSHOTS_QUERY = (
    _SNAPSHOT_FRAGMENT
    + """
    query($dataset: String!) {
        dataset (identifier: $dataset) {
            snapshots {
                ...snapshotFrag
            }
        }
    }
    """
)


def create_snapshot(
    dataset_name: str, snapshot_name: str, description: Optional[str] = None
) -> DatasetSnapshot:
    """Create and store a snapshot of the current state of ``dataset_name``.

    Snapshot name must be unique for the given dataset.

    .. note::

        Only users with ``EDIT`` access can create a snapshot

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
    result = client.post_graphql_request(
        query=_CREATE_SNAPSHOT_QUERY,
        variables={
            "dataset": dataset_name,
            "snapshot": snapshot_name,
            "description": description,
        },
    )
    snapshot = result["createDatasetSnapshot"]
    return DatasetSnapshot(**util.camel_to_snake_container(snapshot))


def delete_snapshot(dataset_name: str, snapshot_name: str):
    """Delete snapshot ``snapshot_name`` from dataset ``dataset_name``.

    .. note::

        Only the snapshot's creator or other users with ``MANAGE`` access can
        delete a snapshot.

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


def list_snapshots(dataset_name: str) -> List[DatasetSnapshot]:
    """Returns a list of all snapshots of a dataset.

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

    dataset = client.post_graphql_request(
        query=_LIST_SNAPSHOTS_QUERY,
        variables={"dataset": dataset_name},
    )["dataset"]
    if dataset is None:
        raise ValueError(f"Unknown dataset {dataset_name}")
    snapshots = dataset["snapshots"]

    return [
        DatasetSnapshot(**snapshot)
        for snapshot in util.camel_to_snake_container(snapshots)
    ]


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
    client.post_graphql_request(
        query=_REVERT_SNAPSHOT_QUERY,
        variables={
            "dataset": dataset_name,
            "snapshot": snapshot_name,
        },
    )
