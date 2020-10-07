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
import fiftyone.core.dataset as fod


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

    def run(self):
        """Runs the revisions"""
        connection = foo.get_db_conn()
        revisions, action = self._get_revisions_to_run()

        for revision, module in revisions:
            fn = etau.get_function(action, module)
            fn(connection, "")

        head_json = {"head": self.destination}
        # etas.write_json(head_json, foc.MIGRATIONS_HEAD_PATH)

    def _get_revisions_to_run(self):
        revision_strings = list(map(lambda rt: rt[0], self.revisions))
        if self.destination is None:
            destination_idx = 0
        else:
            destination_idx = revision_strings.index(self.destination) + 1

        if self.head is None:
            head_idx = 0
        else:
            head_idx = revision_strings.index(self.head)

        action = UP
        if self.destination is None or head_idx > destination_idx:
            action = DOWN
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
                r[:-3].replace("_", "."),
                ".".join([module_prefix, r[:-3]]),
            ),
            filtered_files,
        )
    )


def _load_head():
    head_path = foc.MIGRATIONS_HEAD_PATH

    if os.path.isfile(head_path):
        head_json = etas.load_json(foc.MIGRATIONS_HEAD_PATH)
        return head_json["head"]

    return None


def migrate_if_necessary():
    """Migrates all backing collections for datasets to the latest revision"""
    revisions = _get_revisions()
    head = _load_head()
    latest_revision, _ = revisions[-1]
    if head is None or head < latest_revision:
        Runner(
            head=head, destination=latest_revision, revisions=revisions
        ).run()
