"""
FiftyOne migrations runner.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import mongoengine.errors as moe

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.odm as foo


logger = logging.getLogger(__name__)


DOWN = "down"
UP = "up"


def migrate_all(destination=None):
    """Migrates the database and all datasets to the specified destination
    revision.

    Args:
        destination (None): the destination revision. By default, the
            ``fiftyone`` package version is used
    """
    if destination is None:
        destination = foc.VERSION

    migrate_database_if_necessary(destination=destination)

    for name in fo.list_datasets():
        migrate_dataset_if_necessary(name, destination=destination)


def migrate_dataset_if_necessary(name, destination=None):
    """Migrates the dataset from its current revision to the specified
    destination revision.

    Args:
        name: the name of the dataset
        destination (None): the destination revision. By default, the
            ``fiftyone`` package version is used
    """
    if destination is None:
        destination = foc.VERSION

    try:
        # pylint: disable=no-member
        dataset_doc = foo.DatasetDocument.objects.get(name=name)
    except moe.DoesNotExist:
        raise ValueError("Dataset '%s' not found" % name)

    head = dataset_doc.version

    if head == destination:
        return

    runner = MigrationRunner(head=head, destination=destination)
    if runner.has_revisions:
        logger.info("Migrating dataset '%s' to v%s", name, destination)
        runner.run(name)

    dataset_doc.reload()
    dataset_doc.version = destination
    dataset_doc.save()


def migrate_database_if_necessary(destination=None):
    """Migrates the database to the current revision of the ``fiftyone``
    package, if necessary.

    Args:
        destination (None): the destination revision. By default, the
            ``fiftyone`` package version is used
    """
    if destination is None:
        destination = foc.VERSION

    config = _get_database_config()
    head = config.version

    if head == destination:
        return

    # If there's no database, don't do anything
    client = foo.get_db_client()
    if foc.DEFAULT_DATABASE not in client.list_database_names():
        return

    runner = MigrationRunner(head=head, destination=destination)
    if runner.has_admin_revisions:
        logger.info("Migrating database to v%s", foc.VERSION)
        runner.run_admin()

    config.version = destination
    config_path = _get_database_config_path()
    config.write_json(config_path)


class MigrationRunner(object):
    """Class for running FiftyOne migrations.

    Args:
        head (None): the current revision
        destination (None): the destination revision
    """

    def __init__(
        self,
        head=None,
        destination=None,
        _revisions=None,
        _admin_revisions=None,
    ):
        if _revisions is None:
            _revisions = _get_all_revisions()

        if _admin_revisions is None:
            _admin_revisions = _get_all_revisions(admin=True)

        self._head = head
        self._destination = destination
        self._revisions, self._direction = _get_revisions_to_run(
            head, destination, _revisions
        )
        self._admin_revisions, _ = _get_revisions_to_run(
            head, destination, _admin_revisions
        )

    @property
    def head(self):
        """The head revision."""
        return self._head

    @property
    def destination(self):
        """The destination revision."""
        return self._destination

    @property
    def direction(self):
        """The direction of the migration runner; one of ``("up", "down").``"""
        return self._direction

    @property
    def has_revisions(self):
        """Whether there are any revisions to run."""
        return bool(len(self._revisions))

    @property
    def has_admin_revisions(self):
        """Whether there are any admin revisions to run."""
        return bool(len(self._admin_revisions))

    @property
    def revisions(self):
        """The list of revisions that will be run by :meth:`run`."""
        return list(map(lambda r: r[0], self._revisions))

    @property
    def admin_revisions(self):
        """The list of admin revisions that will be run by :meth:`run_admin`.
        """
        return list(map(lambda r: r[0], self._admin_revisions))

    def run(self, dataset_name):
        """Runs any required migrations on the specified dataset.

        Args:
            dataset_name: the name of the dataset to migrate
        """
        conn = foo.get_db_conn()
        for _, module in self._revisions:
            fcn = etau.get_function(self.direction, module)
            fcn(conn, dataset_name)

    def run_admin(self):
        """Runs any required admin revisions."""
        client = foo.get_db_client()
        for _, module in self._admin_revisions:
            fcn = etau.get_function(self.direction, module)
            fcn(client)


class DatabaseConfig(etas.Serializable):
    """Config for the database's state.

    Args:
        version (None): the ``fiftyone`` package version for which the database
            is configured
    """

    def __init__(self, version=None):
        self.version = version

    @classmethod
    def from_dict(cls, d):
        return cls(**d)


def _get_database_config():
    try:
        config_path = _get_database_config_path()
        return DatabaseConfig.from_json(config_path)
    except FileNotFoundError:
        pass

    return DatabaseConfig()


def _get_database_config_path():
    return os.path.join(fo.config.database_dir, "config.json")


def _get_revisions_to_run(head, destination, revisions):
    revision_strs = list(map(lambda rt: rt[0], revisions))
    direction = UP
    if head == destination:
        return [], direction

    if destination is None or (head is not None and destination < head):
        direction = DOWN

    if destination is None:
        destination_idx = 0
    else:
        for idx, revision in enumerate(revision_strs):
            if revision > destination:
                break

            destination_idx = idx + 1

    if head is None:
        head_idx = 0
    else:
        for idx, revision in enumerate(revision_strs):
            if revision > head:
                break

            head_idx = idx + 1

    if destination is None or head_idx > destination_idx:
        destination_idx, head_idx = head_idx, destination_idx

    revisions_to_run = revisions[head_idx:destination_idx]
    if direction == DOWN:
        revisions_to_run = list(reversed(revisions_to_run))

    return revisions_to_run, direction


def _get_all_revisions(admin=False):
    revisions_dir = foc.MIGRATIONS_REVISIONS_DIR
    if admin:
        revisions_dir = os.path.join(revisions_dir, "admin")

    files = etau.list_files(revisions_dir)
    filtered_files = filter(lambda r: r.endswith(".py"), files)
    module_prefix = ".".join(__loader__.name.split(".")[:-1] + ["revisions"])
    if admin:
        module_prefix = ".".join([module_prefix, "admin"])

    return list(
        map(
            lambda r: (
                r[1:-3].replace("_", "."),
                ".".join([module_prefix, r[:-3]]),
            ),
            filtered_files,
        )
    )
