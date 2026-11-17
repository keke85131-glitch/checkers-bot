import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BOT_TOKEN = os.getenv("BOT_TOKEN", "9247683506:AAEkJ_mugJ5FTDf2JkwKaNVTOgcrYbFrQ90")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://keke85131-glitch.github.io/checkers-bot/")
BACKEND_URL = FRONTEND_URL
