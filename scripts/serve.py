"""Serve an exported game or the legacy reference without stale local files."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GameHandler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class GameServer(ThreadingHTTPServer):
    # A browser loads many ES modules at once; leave room for concurrent tabs.
    request_queue_size = 128


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--directory', default='dist/h5')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    directory = (root / args.directory).resolve()
    if not (directory / 'index.html').is_file():
        parser.error('Build H5 first, or specify --directory . for the legacy reference')
    handler = partial(GameHandler, directory=str(directory))
    with GameServer(('127.0.0.1', args.port), handler) as server:
        print(f'Yongchang: http://127.0.0.1:{args.port}/', flush=True)
        server.serve_forever()
