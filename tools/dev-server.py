#!/usr/bin/env python3
"""
Static development server for Diwali Dhamaka.

`python3 -m http.server` works, but it is a poor fit for a live preview behind
a proxy: it speaks HTTP/1.0 (so every one of the ~30 ES modules needs its own
TCP connection), its listen backlog is 5 (parallel module fetches get refused)
and it answers conditional requests with 304s, which happily serves a stale
bundle after you edit a file.

This fixes all three and otherwise behaves like a plain static file server.
Production hosting needs none of this — see README § Deployment.
"""

import argparse
import http.server
import os
import socket
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
}


class Handler(http.server.SimpleHTTPRequestHandler):
    # Keep-alive: one connection serves the whole module graph.
    protocol_version = 'HTTP/1.1'
    # Without this, Nagle + delayed ACK adds ~40 ms to every response because
    # headers and body go out as separate writes — ~1.2 s across 30 modules.
    disable_nagle_algorithm = True
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **MIME}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        # Never answer 304: during development the newest bytes always win.
        self.headers.replace_header('If-Modified-Since', '') \
            if 'If-Modified-Since' in self.headers else None
        for header in ('If-Modified-Since', 'If-None-Match'):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('X-Content-Type-Options', 'nosniff')
        # The preview runs the page in a cross-origin iframe: stay embeddable
        # and keep module/font fetches unblocked.
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write('%s %s\n' % (self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    request_queue_size = 128
    address_family = socket.AF_INET


def main():
    ap = argparse.ArgumentParser(description='Serve Diwali Dhamaka for local play.')
    ap.add_argument('port', nargs='?', type=int, default=8080)
    ap.add_argument('--bind', default='0.0.0.0')
    args = ap.parse_args()

    try:
        httpd = Server((args.bind, args.port), Handler)
    except OSError as err:
        sys.stderr.write(f'cannot bind {args.bind}:{args.port} — {err}\n')
        return 1

    print(f'Diwali Dhamaka — serving {ROOT}')
    print(f'Listening on http://{args.bind}:{args.port}  (HTTP/1.1, no-store)')
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')
    finally:
        httpd.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
