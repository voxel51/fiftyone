"""
FiftyOne Flask server.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from flask import Flask
from flask_socketio import emit, SocketIO

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


@socketio.on('connect')
def handle_connect():
    print('Client connected')


@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')


@socketio.on("update")
def update_view(view):
    """Update the dataset view

    Args:
        view: the serialized view object
    """
    print(view)
    emit("update", view, broadcast=True)


if __name__ == "__main__":
    socketio.run(app, debug=True)
