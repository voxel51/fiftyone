"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from flask import Flask
from flask_socketio import emit, Namespace, SocketIO

app = Flask(__name__)
app.config["SECRET_KEY"] = "fiftyone"
socketio = SocketIO(app)


@app.route("/")
def get():
    """
    Root API route

    Returns:
        String
    """
    return "I am FiftyOne"


class View(Namespace):
    """Controller for views"""

    def on_connect(self):
        """On connect"""
        print("connected")

    def on_disconnect(self):
        """On disconnect"""
        print("disconnected")

    def on_update(self, view):
        """On update"""
        print("received update")
        print(view)
        emit("update", view, broadcast=True)


socketio.on_namespace(View("/view"))


if __name__ == "__main__":
    socketio.run(app, debug=True)
