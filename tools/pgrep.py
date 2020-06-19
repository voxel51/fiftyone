"""
A very basic reimplementation of the Unix `pgrep` command that works on Windows.

For supported options, run with --help.
"""
import argparse
import psutil

parser = argparse.ArgumentParser(description="Search for processes by name")
parser.add_argument(
    "-f",
    "--full",
    action="store_true",
    help="Search the entire command line of a process",
)
parser.add_argument("search", help="Raw text to search for")
args = parser.parse_args()

for p in psutil.process_iter():
    try:
        text = p.name()
        cmdline = " ".join(p.cmdline())
        if args.full:
            text = cmdline
        if args.search in text:
            print(p.pid, cmdline)
    except psutil.Error:
        pass
