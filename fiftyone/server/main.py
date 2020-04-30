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


@app.route("/")
def get_sample_media():
    """
    Get the sample media

    Returns:
        String
    """
    path = request.args.get("path")
    mime_type = request.args.get("mime_type")
    return send_file(path, mimetype=mime_type)


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
