import tornado

import fiftyone.server.utils as fosu


_notebook_clients = {}


def get_notebook(client):
    """Get a notebook client

    Args:
        client: notebook client
    """
    return _notebook_clients.get(client, None)


def set_notebook(client, value):
    """Set a notebook client

    Args:
        client: notebook client
        value: notebook value
    """
    _notebook_clients[client] = value


class NotebookHandler(fosu.RequestHandler):
    """Check that the requested handle exists on the server"""

    async def get(self):
        # pylint: disable=no-value-for-parameter
        handle_id = self.get_argument("handleId")

        response = self.get_response(handle_id)
        if response is None:
            raise tornado.web.HTTPError(status_code=404)

        self.write(response)

    @staticmethod
    def get_response(handle):
        """Returns if the notebook handle exists on the server.

        Returns:
            the handle ID
        """
        global _notebook_clients
        if handle in set(_notebook_clients.values()):
            return {"exists": True}
