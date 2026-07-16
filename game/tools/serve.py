# Minimal static file server with NO caching (Python twin of serve.js).
# `python -m http.server` sends Last-Modified, and browsers then heuristically
# cache JS/CSS — which shipped a stale ui-map.js after an update. This server
# sends Cache-Control: no-store so a plain refresh always gets fresh files.
# Usage: python tools/serve.py [port]  — serves the game/ folder.
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8477
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as srv:
        print(f"Serving {ROOT} at http://localhost:{PORT}/")
        srv.serve_forever()
