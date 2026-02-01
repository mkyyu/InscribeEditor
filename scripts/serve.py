#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import os


ROOT = Path(__file__).resolve().parent.parent


class CoopCoepHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve Inscribe with COOP/COEP headers.")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on.")
    args = parser.parse_args()

    os.chdir(ROOT)
    server = ThreadingHTTPServer(("0.0.0.0", args.port), CoopCoepHandler)
    print(f"Serving {ROOT} on http://localhost:{args.port}")
    print("COOP/COEP enabled for SharedArrayBuffer.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
