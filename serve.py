"""Tiny static file server for SmashDisplay.

Same idea as `python -m http.server`, but it sends no-cache headers so the
browser always loads the latest files. Without this, Chrome/Edge can keep
showing an old cached app.js after the folder is updated.

Usage: python serve.py [port] [directory]
"""
import sys
import functools
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8077
directory = sys.argv[2] if len(sys.argv) > 2 else "."


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(TCPServer):
    allow_reuse_address = True


handler = functools.partial(NoCacheHandler, directory=directory)
with Server(("127.0.0.1", port), handler) as httpd:
    print("SmashDisplay serving %s on http://127.0.0.1:%d/ (no-cache)" % (directory, port))
    httpd.serve_forever()
