#!/usr/bin/env python3
"""
Simple HTTP server for serving the Otterful Otters dashboard
Run with: python server.py
Then open: http://localhost:8000
"""

import http.server
import socketserver
import os
import urllib.request
import urllib.parse
import json

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Handle API endpoints
        if self.path.startswith('/api/opensea-stats'):
            self.handle_opensea_stats()
        elif self.path.startswith('/api/live-sales'):
            self.handle_live_sales()
        elif self.path.startswith('/api/otherside-manifest'):
            self.handle_otherside_manifest()
        else:
            # Serve static files
            super().do_GET()
    
    def handle_opensea_stats(self):
        """Proxy OpenSea API calls to avoid CORS issues"""
        try:
            collection_slug = 'otterful-otters'
            
            # Fetch collection stats
            stats_url = f'https://api.opensea.io/api/v1/collection/{collection_slug}/stats'
            stats_request = urllib.request.Request(stats_url)
            stats_request.add_header('Accept', 'application/json')
            
            with urllib.request.urlopen(stats_request, timeout=10) as response:
                stats_data = json.loads(response.read().decode())
            
            # Fetch collection data for best offer
            collection_url = f'https://api.opensea.io/api/v1/collection/{collection_slug}'
            collection_request = urllib.request.Request(collection_url)
            collection_request.add_header('Accept', 'application/json')
            
            collection_data = {}
            try:
                with urllib.request.urlopen(collection_request, timeout=10) as response:
                    collection_data = json.loads(response.read().decode())
            except Exception as e:
                print(f"Warning: Could not fetch collection data: {e}")
            
            # Combine the data
            result = {
                'stats': stats_data.get('stats', {}),
                'collection': collection_data.get('collection', {})
            }
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except urllib.error.HTTPError as e:
            print(f"HTTP Error fetching OpenSea data: {e.code} - {e.reason}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': f'HTTP {e.code}: {e.reason}'}).encode())
        except Exception as e:
            print(f"Error fetching OpenSea data: {e}")
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def handle_live_sales(self):
        """Fetch last 10 sales (OpenSea events) for the collection"""
        try:
            collection_slug = 'otterful-otters'
            url = f'https://api.opensea.io/api/v1/events?collection_slug={collection_slug}&event_type=successful&limit=10'
            req = urllib.request.Request(url)
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode())

            contract_address = '0x4e5913922b7ddf916c8d27d1016827f799687e66'
            sales = []
            for evt in data.get('asset_events') or []:
                try:
                    buyer = (evt.get('winner_account') or {}).get('address') or (evt.get('buyer') or {}).get('address') or '—'
                    if isinstance(buyer, dict):
                        buyer = buyer.get('address', '—')
                    price = evt.get('total_price')
                    token = evt.get('payment_token') or {}
                    decimals = int(token.get('decimals') or 18)
                    if price is not None and decimals:
                        price_val = int(price) / (10 ** decimals)
                    else:
                        price_val = 0
                    symbol = (token.get('symbol') or 'ETH').upper()
                    asset = evt.get('asset') or {}
                    token_id = asset.get('token_id') or (evt.get('asset') and evt['asset'].get('token_id'))
                    permalink = asset.get('permalink') or ''
                    if not permalink and token_id:
                        permalink = f'https://magiceden.us/item-details/apechain/{contract_address}/{token_id}'
                    sales.append({
                        'buyer': buyer[:6] + '…' + buyer[-4:] if isinstance(buyer, str) and len(buyer) > 12 else (buyer or '—'),
                        'price': round(price_val, 4),
                        'symbol': symbol,
                        'link': permalink,
                        'token_id': token_id,
                    })
                except (KeyError, TypeError, ZeroDivisionError):
                    continue
            result = {'sales': sales[:10]}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except urllib.error.HTTPError as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'sales': [], 'error': str(e.code)}).encode())
        except Exception as e:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'sales': [], 'error': str(e)}).encode())

    def handle_otherside_manifest(self):
        """Return list of Otherside photos and thumbnails for the gallery"""
        try:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            originals_dir = os.path.join(base_dir, 'Otherside Otter Photos')
            thumbs_dir = os.path.join(base_dir, 'Otherside Otter Photos_thumbnails')
            image_exts = ('.png', '.jpg', '.jpeg', '.webp', '.gif')

            originals = []
            if os.path.isdir(originals_dir):
                originals = sorted(
                    [f for f in os.listdir(originals_dir)
                     if os.path.isfile(os.path.join(originals_dir, f)) and f.lower().endswith(image_exts)],
                    key=lambda x: x.lower()
                )

            thumb_set = set()
            thumb_list = []
            if os.path.isdir(thumbs_dir):
                thumb_list = [f for f in os.listdir(thumbs_dir) if os.path.isfile(os.path.join(thumbs_dir, f))]
                thumb_set = {f.lower() for f in thumb_list}
                thumb_list = sorted(thumb_list, key=lambda x: x.lower())

            if originals:
                files = []
                for name in originals:
                    base, _ = os.path.splitext(name)
                    thumb_name = base + '.jpg'
                    files.append({
                        'name': name,
                        'thumbName': thumb_name,
                        'hasThumbnail': thumb_name.lower() in thumb_set,
                    })
            else:
                files = []
                for thumb_name in thumb_list:
                    base, _ = os.path.splitext(thumb_name)
                    files.append({'name': base + '.png', 'thumbName': thumb_name, 'hasThumbnail': True})

            result = {'count': len(files), 'files': files}
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

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

