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
        self.head = head
        self.destination = destination
        self.revisions = revisions

    def run(self, dataset_names=[]):
        """Runs the revisions"""
        connection = foo.get_db_conn()
        revisions, action = self._get_revisions_to_run()

        for dataset_name in dataset_names:
            for revision, module in revisions:
                fcn = etau.get_function(action, module)
                fcn(connection, dataset_name)

    def _get_revisions_to_run(self):
        revisions = self.revisions.copy()
        revision_strs = list(map(lambda rt: rt[0], self.revisions))
        action = UP
        if self.destination is None or self.destination < self.head:
            action = DOWN

        if self.destination is None:
            destination_idx = 0
        else:
            for idx, revision in enumerate(revision_strs):
                if revision > self.destination:
                    break
                destination_idx = idx

        if self.head is None:
            head_idx = 0
        else:
            for idx, revision in enumerate(revision_strs):
                if revision > self.head:
                    break
                head_idx = idx

        if self.destination is None or head_idx > destination_idx:
            destination_idx += 1

        revisions_to_run = self.revisions[head_idx:destination_idx]
        if action == DOWN:
            revisions_to_run = list(reversed(revisions_to_run))

        return revisions_to_run, action


def _get_revisions():
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


def migrate_dataset(dataset_name, head, destination):
    """Migrates a single dataset to the latest revision.

    Args:
        dataset_name: the dataset's name
        head: the current version
        destination: the destination version
    """
    revisions = _get_revisions()
    Runner(head=head, destination=destination, revisions=revisions).run()
