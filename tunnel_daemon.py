import subprocess
import re
import time
import os

HOST_FILE = os.path.join(os.path.dirname(__file__), "tunnel_host.txt")

def run_tunnel():
    cmd = [
        "ssh",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=10",
        "-o", "ServerAliveCountMax=3",
        "-R", "80:127.0.0.1:8000",
        "nokey@localhost.run"
    ]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    for line in iter(proc.stdout.readline, ''):
        line = line.strip()
        if "tunneled with tls termination" in line:
            match = re.search(r'([a-z0-9]+\.app\.lhr\.life)', line, re.IGNORECASE)
            if match:
                new_host = match.group(1).lower()
                with open(HOST_FILE, "w", encoding="utf-8") as f:
                    f.write(new_host)
                print(f"[TUNNEL] Active host updated: {new_host}", flush=True)

    proc.wait()
    print("[TUNNEL] Disconnected, auto-reconnecting in 2s...", flush=True)

if __name__ == "__main__":
    print("[TUNNEL] Starting auto-healing tunnel manager...", flush=True)
    while True:
        try:
            run_tunnel()
        except Exception as e:
            print(f"[TUNNEL] Loop exception: {e}", flush=True)
        time.sleep(2)
