"""
FiftyOne service utilities unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest
from unittest import mock

import psutil
from pymongo.errors import AutoReconnect, ServerSelectionTimeoutError

import fiftyone.service.util as fosu


def _mock_process(wait_side_effect=None):
    process = mock.Mock(spec=psutil.Process)
    if wait_side_effect is not None:
        process.wait.side_effect = wait_side_effect
    return process


class ShutdownMongodTests(unittest.TestCase):
    """Tests that the database is asked to shut itself down rather than being
    terminated, which would leave its cached collection metadata stale.
    """

    def test_sends_shutdown_command(self):
        process = _mock_process()

        with mock.patch.object(
            fosu, "get_listening_tcp_ports", return_value=iter([27017])
        ), mock.patch("pymongo.MongoClient") as mock_client:
            self.assertTrue(fosu.shutdown_mongod(process))

        mock_client.assert_called_once()
        self.assertEqual(mock_client.call_args.kwargs["port"], 27017)
        mock_client.return_value.admin.command.assert_called_once_with(
            "shutdown", 1
        )
        mock_client.return_value.close.assert_called_once()
        process.wait.assert_called_once()

    def test_disconnect_during_shutdown_is_expected(self):
        # The database closes its connections as it shuts down, so the command
        # does not return normally
        process = _mock_process()

        with mock.patch.object(
            fosu, "get_listening_tcp_ports", return_value=iter([27017])
        ), mock.patch("pymongo.MongoClient") as mock_client:
            mock_client.return_value.admin.command.side_effect = AutoReconnect(
                "connection closed"
            )
            self.assertTrue(fosu.shutdown_mongod(process))

        mock_client.return_value.close.assert_called_once()

    def test_not_listening(self):
        process = _mock_process()

        with mock.patch.object(
            fosu, "get_listening_tcp_ports", return_value=iter([])
        ), mock.patch("pymongo.MongoClient") as mock_client:
            self.assertFalse(fosu.shutdown_mongod(process))

        mock_client.assert_not_called()

    def test_unreachable_database(self):
        process = _mock_process()

        with mock.patch.object(
            fosu, "get_listening_tcp_ports", return_value=iter([27017])
        ), mock.patch("pymongo.MongoClient") as mock_client:
            mock_client.return_value.admin.command.side_effect = (
                ServerSelectionTimeoutError("no server")
            )
            self.assertFalse(fosu.shutdown_mongod(process))

    def test_shutdown_times_out(self):
        process = _mock_process(
            wait_side_effect=psutil.TimeoutExpired(seconds=1)
        )

        with mock.patch.object(
            fosu, "get_listening_tcp_ports", return_value=iter([27017])
        ), mock.patch("pymongo.MongoClient"):
            self.assertFalse(fosu.shutdown_mongod(process, timeout=1))

        process.wait.assert_called_once_with(timeout=1)

    def test_process_gone(self):
        process = _mock_process()

        with mock.patch.object(
            fosu,
            "get_listening_tcp_ports",
            side_effect=psutil.NoSuchProcess(pid=1),
        ):
            self.assertFalse(fosu.shutdown_mongod(process))


if __name__ == "__main__":
    unittest.main(verbosity=2)
