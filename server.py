"""Local development server for Efty.

Serves static files and proxies RSS feed requests to avoid CORS issues.
Usage: python server.py
"""

import http.server
import json
import os
import urllib.error
import urllib.request

PORT = 8000
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))


class EftyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith("/proxy?url="):
            self.handle_proxy()
        else:
            super().do_GET()

    def handle_proxy(self):
        url = self.path[len("/proxy?url="):]
        url = urllib.request.unquote(url)

        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Efty RSS Reader/1.0",
                "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml",
            })
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
                content_type = resp.headers.get("Content-Type", "application/xml")

            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, str(e.reason))
        except Exception as e:
            self.send_error(502, str(e))

    def log_message(self, format, *args):
        print(f"  {args[0]}")


if __name__ == "__main__":
    with http.server.HTTPServer(("", PORT), EftyHandler) as httpd:
        print(f"Efty running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
