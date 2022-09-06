"""
FiftyOne migrations runner.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import bisect
import logging
import os
from packaging.requirements import Requirement
from packaging.version import Version as V

import eta.core.utils as etau

import fiftyone as fo
import fiftyone.constants as foc
import fiftyone.core.odm as foo
import fiftyone.core.utils as fou


logger = logging.getLogger(__name__)


DOWN = "down"
UP = "up"


def Version(version):
    """A ``packaging.version.Version`` proxy that excludes things like RC
    version info.
    """
    return V(V(version).base_version)


def _migrations_disabled():
    return os.environ.get("FIFTYONE_DISABLE_MIGRATIONS", "0") != "0"


def get_database_revision():
    """Gets the current revision of the database.

    Returns:
        the database revision string
    """
    config = foo.get_db_config()
    return config.version


def get_dataset_revision(name):
    """Gets the current revision of the given dataset.

    Args:
        name: the name of the dataset

    Returns:
        the dataset revision string
    """
    conn = foo.get_db_conn()
    dataset_doc = conn.datasets.find_one({"name": name}, {"version": 1})
    if dataset_doc is None:
        raise ValueError("Dataset '%s' not found" % name)

    return dataset_doc.get("version", None)


def migrate_all(destination=None, error_level=0, verbose=False):
    """Migrates the database and all datasets to the specified destination
    revision.

    If ``fiftyone.config.database_admin`` is ``False`` and no ``destination``
    is provided, the database and each dataset will only be migrated if their
    current versions are not compatible with the client's version.

    Args:
        destination (None): the destination revision. By default, the
            ``fiftyone`` client version is used
        error_level (0): the error level to use if an individual dataset cannot
            be migrated. Valid values are:

            -   0: raise error if a dataset cannot be migrated
            -   1: log warning if a dataset cannot be migrated
            -   2: ignore datasets that cannot be migrated
        verbose (False): whether to log incremental migrations that are run
    """
    migrate_database_if_necessary(destination=destination, verbose=verbose)

    for name in fo.list_datasets():
        migrate_dataset_if_necessary(
            name,
            destination=destination,
            error_level=error_level,
            verbose=verbose,
        )


def migrate_database_if_necessary(destination=None, verbose=False):
    """Migrates the database to the specified revision, if necessary.

    If ``fiftyone.config.database_admin`` is ``False`` and no ``destination``
    is provided, the database will only be migrated if its current version is
    not compatible with the client's version.

    Args:
        destination (None): the destination revision. By default, the
            ``fiftyone`` client version is used
        verbose (False): whether to log incremental migrations that are run
    """
    if _migrations_disabled():
        return

    config = foo.get_db_config()
    head = config.version

    default_destination = destination is None

    if default_destination:
        if not fo.config.database_admin and _is_compatible_version(head):
            return

        destination = foc.VERSION

    if head == destination:
        return

    if not fo.config.database_admin:
        if default_destination:
            if foc.COMPATIBLE_VERSIONS:
                compat_str = " (compatibility %s)" % foc.COMPATIBLE_VERSIONS
            else:
                compat_str = ""

            raise EnvironmentError(
                "Cannot connect to database v%s with client v%s%s. "
                "See https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations "
                "for more information" % (head, destination, compat_str)
            )
        else:
            raise EnvironmentError(
                "Cannot migrate database from v%s to v%s when database_admin=%s. "
                "See https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations "
                "for more information"
                % (head, destination, fo.config.database_admin)
            )

    if _database_exists():
        runner = MigrationRunner(head, destination)
        if runner.has_admin_revisions:
            logger.info("Migrating database to v%s", destination)
            runner.run_admin(verbose=verbose)

    config.version = destination
    config.save()


def needs_migration(name=None, head=None, destination=None):
    """Determines whether a dataset requires a migration in order to be used in
    the specified destination revision.

    To use this method, specify either the ``name`` of an existing dataset or
    provide the ``head`` revision of the dataset.

    If ``fiftyone.config.database_admin`` is ``False`` and no ``destination``
    is provided, a dataset will be deemed to require no migration if its
    current version if compatible with the client's version.

    Args:
        name (None): the name of the dataset
        head (None): the current revision of the dataset
        destination (None): the destination revision. By default, the current
            database version is used

    Returns:
        True/False
    """
    if name is not None:
        head = get_dataset_revision(name)

    if head is None:
        head = "0.0"

    if destination is None:
        if not fo.config.database_admin and _is_compatible_version(head):
            return False

        destination = get_database_revision()

    if head == destination:
        return False

    runner = MigrationRunner(head, destination)
    return runner.has_revisions


def migrate_dataset_if_necessary(
    name,
    destination=None,
    error_level=0,
    verbose=False,
):
    """Migrates the dataset from its current revision to the specified
    destination revision.

    If ``fiftyone.config.database_admin`` is ``False`` and no ``destination``
    is provided, the dataset will only be migrated if its current version is
    not compatible with the client's version.

    Args:
        name: the name of the dataset
        destination (None): the destination revision. By default, the current
            database version is used
        error_level (0): the error level to use. Valid values are:

            -   0: raise error if the dataset cannot be migrated
            -   1: log warning if the dataset cannot be migrated
            -   2: ignore datasets that cannot be migrated
        verbose (False): whether to log incremental migrations that are run
    """
    try:
        _migrate_dataset_if_necessary(name, destination, verbose)
    except Exception as e:
        fou.handle_error(e, error_level=error_level)


def _migrate_dataset_if_necessary(name, destination, verbose):
    if _migrations_disabled():
        return

    head = get_dataset_revision(name)
    db_version = get_database_revision()

    if head is None:
        head = "0.0"

    default_destination = destination is None

    if default_destination:
        if not fo.config.database_admin and _is_compatible_version(head):
            return

        destination = db_version

    if head == destination:
        return

    if not fo.config.database_admin and destination != db_version:
        if default_destination:
            if foc.COMPATIBLE_VERSIONS:
                compat_str = " (compatibility %s)" % foc.COMPATIBLE_VERSIONS
            else:
                compat_str = ""

            raise EnvironmentError(
                "Cannot load dataset '%s' from v%s with client v%s%s. "
                "See https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations "
                "for more information" % (name, head, foc.VERSION, compat_str)
            )
        else:
            raise EnvironmentError(
                "Cannot migrate dataset '%s' from v%s to v%s when database_admin=%s."
                "See https://voxel51.com/docs/fiftyone/user_guide/config.html#database-migrations "
                "for more information"
                % (name, head, destination, fo.config.database_admin)
            )

    runner = MigrationRunner(head, destination)
    if runner.has_revisions:
        logger.info("Migrating dataset '%s' to v%s", name, destination)
        runner.run(name, verbose=verbose)

    if Version(destination) >= Version("0.6.2"):
        conn = foo.get_db_conn()
        conn.datasets.update_one(
            {"name": name}, {"$set": {"version": destination}}
        )
    else:
        # Old version of FiftyOne that didn't store dataset versions
        pass


class MigrationRunner(object):
    """Class for running FiftyOne migrations.

    Args:
        head: the current revision
        destination: the destination revision
    """

    def __init__(
        self,
        head,
        destination,
        _revisions=None,
        _admin_revisions=None,
    ):
        pkg_ver = Version(foc.VERSION)
        head_ver = Version(head)
        dest_ver = Version(destination)
        if head_ver > pkg_ver or dest_ver > pkg_ver:
            raise EnvironmentError(
                "You must have fiftyone>=%s installed in order to migrate "
                "from v%s to v%s, but you are currently running fiftyone==%s."
                "\n\nSee https://voxel51.com/docs/fiftyone/getting_started/install.html#downgrading-fiftyone "
                "for information about downgrading FiftyOne."
                % (max(head_ver, dest_ver), head_ver, dest_ver, pkg_ver)
            )

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
        return bool(self._revisions)

    @property
    def has_admin_revisions(self):
        """Whether there are any admin revisions to run."""
        return bool(self._admin_revisions)

    @property
    def revisions(self):
        """The list of revisions that will be run by :meth:`run`."""
        return [r[0] for r in self._revisions]

    @property
    def admin_revisions(self):
        """The list of admin revisions that will be run by :meth:`run_admin`."""
        return [r[0] for r in self._admin_revisions]

    def run(self, dataset_name, verbose=False):
        """Runs any required migrations on the specified dataset.

        Args:
            dataset_name: the name of the dataset to migrate
            verbose (False): whether to log incremental migrations that are run
        """
        conn = foo.get_db_conn()
        for rev, module in self._revisions:
            if verbose:
                logger.info("Running v%s %s migration", rev, self.direction)

            fcn = etau.get_function(self.direction, module)
            fcn(conn, dataset_name)

    def run_admin(self, verbose=False):
        """Runs any required admin revisions.

        Args:
            verbose (False): whether to log incremental migrations that are run
        """
        client = foo.get_db_client()
        for rev, module in self._admin_revisions:
            if verbose:
                logger.info(
                    "Running v%s %s admin migration", rev, self.direction
                )

            fcn = etau.get_function(self.direction, module)
            fcn(client)


def _database_exists():
    client = foo.get_db_client()
    return fo.config.database_name in client.list_database_names()


def _is_compatible_version(version):
    specifier = foc.COMPATIBLE_VERSIONS or ("==%s" % foc.VERSION)
    req = Requirement("fiftyone" + specifier)
    return req.specifier.contains(version)


def _get_revisions_to_run(head, dest, revisions):
    revisions = sorted(revisions, key=lambda r: Version(r[0]))

    head = Version(head)
    dest = Version(dest)

    rev_versions = [Version(r[0]) for r in revisions]

    head_idx = bisect.bisect(rev_versions, head)
    dest_idx = bisect.bisect(rev_versions, dest)

    if dest >= head:
        revisions_to_run = revisions[head_idx:dest_idx]
        return revisions_to_run, UP

    revisions_to_run = revisions[dest_idx:head_idx][::-1]
    return revisions_to_run, DOWN


def _get_all_revisions(admin=False):
    revisions_dir = foc.MIGRATIONS_REVISIONS_DIR
    if admin:
        revisions_dir = os.path.join(revisions_dir, "admin")

    revision_files = [
        f for f in etau.list_files(revisions_dir) if f.endswith(".py")
    ]

    module_prefix = __loader__.name.rsplit(".", 1)[0] + ".revisions"
    if admin:
        module_prefix = module_prefix + ".admin"

    revisions = []
    for filename in revision_files:
        version = filename[1:-3].replace("_", ".")
        module = module_prefix + "." + filename[:-3]
        revisions.append((version, module))

    return sorted(revisions, key=lambda r: Version(r[0]))
