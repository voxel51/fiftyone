"""
FiftyOne migrations runner.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone as fo
import fiftyone.core.odm as foo
import fiftyone.constants as foc


DOWN = "down"
UP = "up"


class Runner(object):
    """Migration runner

    Args:
        head: the current head revision
        destination: the destination head revision
        revisions: the list of revisions
    """

    def __init__(self, head=None, destination=None, revisions=[]):
        self._head = head
        self._destination = destination
        self._revisions = revisions
        self._revisions_to_run, self._direction = self._get_revisions_to_run()

    def run(self, dataset_names=[]):
        """Runs the revisions.

        Args:
            dataset_names: a list of names of dataset to run the migration against
        """
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


def get_revisions():
    """Get the list of FiftyOne revisions.

    Returns:
        (revision_number, module_name)
    """
    files = etau.list_files(foc.MIGRATIONS_REVISIONS_DIR)
    filtered_files = filter(lambda r: r.endswith(".py"), files)
    module_prefix = ".".join(__loader__.name.split(".")[:-1] + ["revisions"])
    return list(
        map(
            lambda r: (
                r[1:-3].replace("_", "."),
                ".".join([module_prefix, r[:-3]]),
            ),
            filtered_files,
        )
    )


def get_migration_runner(head, destination):
    """Migrates a single dataset to the latest revision.

    Args:
        head: the current version
        destination: the destination version
    """
    revisions = get_revisions()
    return Runner(head=head, destination=destination, revisions=revisions)
