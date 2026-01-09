#!/usr/bin/env python3
"""
Simple HTTP server for serving the Otterful Otters dashboard
Run with: python server.py
Then open: http://localhost:8000
"""

import http.server
import socketserver
import os

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers to allow loading images
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET')
        # Enable caching for images to speed up loading
        if self.path.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp')):
            self.send_header('Cache-Control', 'public, max-age=31536000')  # Cache for 1 year
        else:
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"Server running at http://localhost:{PORT}/")
        print("Press Ctrl+C to stop the server")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

