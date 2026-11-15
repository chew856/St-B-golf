"""Local server for the Ashbourne system that always serves the latest files (no browser caching).
Run: python3 serve.py  then open http://localhost:8000 (staff) or http://localhost:8000/member.html (members)."""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


# Threaded: Safari opens several connections at once and keeps them alive, which stalls a one-request-at-a-time server.
socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    httpd.serve_forever()
