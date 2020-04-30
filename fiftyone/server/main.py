"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

from flask import Flask, request, send_file
from flask_socketio import emit, Namespace, SocketIO

app = Flask(__name__)
app.config["SECRET_KEY"] = "fiftyone"
socketio = SocketIO(app)


@app.route("/<path:subpath>/<fl>")
def get_file(subpath, fl):
    """
    Get a file. Assumes the file is image at the moment

    Returns:
        String
    """
    base = "/home/ben/code/fiftyone/examples/data"
    path = os.path.join(base, subpath, fl)
    return send_file(
        path,
        mimetype="image/jpeg",
        as_attachment=True,
        attachment_filename=os.path.basename(fl),
    )


class State(Namespace):
    """Controller for state"""

    def on_connect(self):
        """On connect"""
        print("connected state")

    def on_disconnect(self):
        """On disconnect"""
        print("disconnected state")

    def on_update(self, state):
        """On update"""
        print("received update")
        print(state)
        emit("update", state, broadcast=True)


socketio.on_namespace(State("/state"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
