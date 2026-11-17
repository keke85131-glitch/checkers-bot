import time
import urllib.request
import os

host_file = os.path.join(os.path.dirname(__file__), "tunnel_host.txt")

while True:
    host = "2baca35c7adc9c.app.lhr.life"
    if os.path.exists(host_file):
        try:
            with open(host_file, "r", encoding="utf-8") as f:
                c = f.read().strip()
                if c:
                    host = c
        except Exception:
            pass
    try:
        url = f"https://{host}/docs"
        urllib.request.urlopen(url, timeout=10)
    except Exception:
        pass
    time.sleep(15)
