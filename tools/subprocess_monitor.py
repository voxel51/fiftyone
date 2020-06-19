"""
Builds a list of all children of a process, then waits for the process and
all of its children to exit. Note that this does not (currently) detect any
new subprocesses that launch after this script is started.

Usage:
    python subprocess_monitor.py PROCESS_ID
"""

import os, psutil, sys

_format_cache = {}


def format_proc(p):
    if p.pid not in _format_cache:
        _format_cache[p.pid] = " ".join(map(os.path.basename, p.cmdline()))
    return _format_cache[p.pid]


def print_tree(p, depth=0):
    print(("+ " * depth + format_proc(p))[:80])
    for c in p.children():
        print_tree(c, depth + 1)


def on_terminate(p):
    print("terminated: " + format_proc(p))


try:
    p = psutil.Process(int(sys.argv[1]))
except psutil.NoSuchProcess:
    exit("not found")

print_tree(p)

psutil.wait_procs([p] + p.children(recursive=True), callback=on_terminate)
