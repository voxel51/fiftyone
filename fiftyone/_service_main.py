import collections
import os
import signal
import subprocess
import sys
import threading


exiting = threading.Event()


class ChildStreamMonitor(object):
    def __init__(self, stream):
        self.stream = stream
        self.output_deque = collections.deque(maxlen=4)

        thread = threading.Thread(target=self.run_monitor_thread)
        thread.daemon = True
        thread.start()

    def run_monitor_thread(self):
        while True:
            chunk = self.stream.read(1024)
            if not chunk:
                # EOF - subprocess has exited, so trigger shutdown
                exiting.set()
                break
            self.output_deque.appendleft(chunk)

    def to_bytes(self):
        return b"".join(self.output_deque)


if __name__ != "__main__":
    raise RuntimeError(
        "This file is for internal use only and cannot be imported"
    )

command = sys.argv[1:]
if not command:
    raise ValueError("No command given")

# ignore signals sent to the parent process - parent process termination is
# handled below, and necessary for cleaning up the child process

if hasattr(os, "setpgrp"):
    # UNIX-only: prevent child process from receiving SIGINT/other signals
    # from the parent process
    os.setpgrp()
signal.signal(signal.SIGINT, signal.SIG_IGN)

child = subprocess.Popen(
    command,
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
child_stdout = ChildStreamMonitor(child.stdout)
child_stderr = ChildStreamMonitor(child.stderr)


def monitor_stdin():
    # wait until EOF, which means that the parent process has exited
    while len(sys.stdin.read(1)):
        pass
    exiting.set()


stdin_thread = threading.Thread(target=monitor_stdin)
stdin_thread.daemon = True
stdin_thread.start()

exiting.wait()

child.terminate()
if child.wait() > 0:
    sys.stdout.buffer.write(child_stdout.to_bytes())
    sys.stdout.flush()
    sys.stderr.write(
        "Subprocess %r exited with error %i:\n" % (command, child.returncode)
    )
    sys.stderr.buffer.write(child_stderr.to_bytes())
    sys.stderr.flush()
