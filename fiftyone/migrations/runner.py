"""
FiftyOne migrations runner.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.odm as foo


logger = logging.getLogger(__name__)


DOWN = "down"
UP = "up"


class Runner(object):
    """Migration runner

    Args:
        head: the current head revision
        destination: the destination head revision
        revisions: the list of revisions
    """

    def __init__(self, head=None, destination=None, revisions=[], admin=False):
        self._admin = admin
        self._head = head
        self._destination = destination
        self._revisions = revisions
        self._revisions_to_run, self._direction = self._get_revisions_to_run()

    def run(self, dataset_names=[]):
        """Runs the revisions.

        Args:
            dataset_names: a list of names of dataset to run the migration against
        """
        if self._admin:
            client = foo.get_db_client()
            for revision, module in self._revisions_to_run:
                fcn = etau.get_function(self.direction, module)
                fcn(client)
        else:
            conn = foo.get_db_conn()
            for dataset_name in dataset_names:
                for revision, module in self._revisions_to_run:
                    fcn = etau.get_function(self.direction, module)
                    fcn(conn, dataset_name)

    @property
    def direction(self):
        """Returns the direction up the runner. One of ("up", "down")."""
        return self._direction

    @property
    def has_revisions(self):
        """Returns True if there are revisions to run."""
        return bool(len(self._revisions_to_run))

    @property
    def revisions(self):
        """The list of revision that the Runner will run."""
        return list(map(lambda r: r[0], self._revisions_to_run))

    def _get_revisions_to_run(self):
        revision_strs = list(map(lambda rt: rt[0], self._revisions))
        direction = UP
        if self._head == self._destination:
            return [], direction

        if self._destination is None or (
            self._head is not None and self._destination < self._head
        ):
            direction = DOWN

        if self._destination is None:
            destination_idx = 0
        else:
            for idx, revision in enumerate(revision_strs):
                if revision > self._destination:
                    break
                destination_idx = idx + 1

        if self._head is None:
            head_idx = 0
        else:
            for idx, revision in enumerate(revision_strs):
                if revision > self._head:
                    break
                head_idx = idx + 1

        if self._destination is None or head_idx > destination_idx:
            tmp = head_idx
            head_idx = destination_idx
            destination_idx = tmp

        revisions_to_run = self._revisions[head_idx:destination_idx]
        if direction == DOWN:
            revisions_to_run = list(reversed(revisions_to_run))

        return revisions_to_run, direction


def get_revisions(admin=False):
    """Get the list of FiftyOne revisions.

    Returns:
        (revision_number, module_name)
    """
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


def get_migration_runner(head, destination, admin=False):
    """Migrates a single dataset to the latest revision.

    Args:
        head: the current version
        destination: the destination version
        admin: whether to target admin revisions
    """
    revisions = get_revisions(admin=admin)
    return Runner(
        head=head, destination=destination, revisions=revisions, admin=admin
    )


class DatabaseConfig(etas.Serializable):
    """Config for a database's state."""

    def __init__(self, version=None):
        """Creates a DatabaseConfig instance.

        version: the installed version of fiftyone
        """
        self.version = version

    @classmethod
    def from_dict(cls, d):
        """Constructs a DatabaseConfig object from a JSON dictionary."""
        return cls(**d)


def migrate_database_if_necessary():
    """Migrates the fiftyone database, if necessary."""
    config_path = os.path.join(fo.config.database_dir, "config.json")
    client = foo.get_db_client()
    if foc.DEFAULT_DATABASE not in client.list_database_names():
        config = DatabaseConfig(version=foc.VERSION)
        config.write_json(config_path)
        return

    try:
        config = DatabaseConfig.from_json(config_path)
        head = config.version
        config.version = foc.VERSION
    except FileNotFoundError:
        config = DatabaseConfig(version=foc.VERSION)
        head = None

    destination = foc.VERSION
    if head != destination:
        runner = get_migration_runner(head, destination, admin=True)
        if runner.has_revisions:
            logger.info(
                "Migrating database to the current version (%s)", foc.VERSION,
            )
            runner.run()
            config.write_json(config_path)
