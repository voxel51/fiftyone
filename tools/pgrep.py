import argparse
import psutil

parser = argparse.ArgumentParser()
parser.add_argument("-c", "--cmdline", action="store_true")
parser.add_argument("search")
args = parser.parse_args()

for p in psutil.process_iter():
    try:
        text = p.name()
        cmdline = " ".join(p.cmdline())
        if args.cmdline:
            text = cmdline
        if args.search in text:
            print(p.pid, cmdline)
    except psutil.Error:
        pass
