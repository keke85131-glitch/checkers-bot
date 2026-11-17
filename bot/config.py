import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except Exception:
        pass

BOT_TOKEN = os.getenv("BOT_TOKEN", "9247683506:AAH8Sr0ayiWLq87PDSZjeDfeZnxBkEnaPeQ")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:8000")
