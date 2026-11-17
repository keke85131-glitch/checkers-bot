import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BOT_TOKEN = os.getenv("BOT_TOKEN", "9247683506:AAH8Sr0ayiWLq87PDSZjeDfeZnxBkEnaPeQ")
BACKEND_URL = os.getenv("BACKEND_URL", "https://81ba26d6b301ba.app.lhr.life")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://81ba26d6b301ba.app.lhr.life")
