# ♟️ Checkers Mini App — Telegram бот + Full-Stack игра в шашки

> Telegram Mini App с игрой в русские шашки. Бот работает в inline-режиме: пользователь упоминает его в любом чате, создаётся комната, второй игрок присоединяется по ссылке.

---

## Содержание
1. [Архитектура](#архитектура)
2. [Создание бота у BotFather](#создание-бота-у-botfather)
3. [Деплой Backend на Render.com](#деплой-backend-на-rendercom)
4. [Деплой Frontend на GitHub Pages](#деплой-frontend-на-github-pages)
5. [Переменные окружения](#переменные-окружения)
6. [Локальный запуск и тестирование](#локальный-запуск-и-тестирование)

---

## Архитектура

```
Telegram Client
      │  inline query
      ▼
  Telegram Bot (aiogram 3)  ──POST /api/room/create──▶  FastAPI Backend
      │                                                       │
      │  returns Web App button                     WebSocket /ws/{room}/{pid}
      ▼                                                       │
  Frontend (GitHub Pages)  ◀────────── game_state JSON ──────┘
  HTML + CSS + JS (Vanilla)
```

- **Bot** — aiogram 3, inline-режим. Создаёт комнату, отдаёт кнопку Web App.
- **Backend** — FastAPI + WebSocket. Хранит состояние игр в памяти, реализует логику русских шашек.
- **Frontend** — чистый HTML/CSS/JS, подключается к backend по WebSocket.

---

## Создание бота у BotFather

1. Открой [@BotFather](https://t.me/BotFather) в Telegram.

2. Создай нового бота:
   ```
   /newbot
   ```
   Введи имя (например, `Checkers Game`) и username (например, `CheckersGameBot`).

3. **Сохрани токен** — он понадобится как переменная `BOT_TOKEN`.

4. Включи **inline-режим**:
   ```
   /setinline
   ```
   Выбери своего бота → введи подсказку для поля поиска, например:
   ```
   Создать партию в шашки...
   ```

5. *(Опционально)* Задай описание и фото:
   ```
   /setdescription
   /setuserpic
   ```

6. Включи Web Apps (если не включены автоматически):
   ```
   /setmenubutton
   ```
   → выбери бота → `Web App` → введи URL твоего frontend.

---

## Деплой Backend на Render.com

### Шаг 1 — Подготовка репозитория

Убедись, что в корне проекта есть:
- `requirements.txt`
- `render.yaml`
- папка `server/` с `main.py`, `game_logic.py`, `room_manager.py`

### Шаг 2 — Создание сервиса на Render

1. Зайди на [render.com](https://render.com) и зарегистрируйся / войди.
2. Нажми **New → Web Service**.
3. Подключи свой GitHub репозиторий.
4. Render автоматически обнаружит `render.yaml` — нажми **Apply**.

   Или настрой вручную:
   | Поле | Значение |
   |---|---|
   | Environment | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn server.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

### Шаг 3 — Переменные окружения

В разделе **Environment** добавь:

| Переменная | Значение |
|---|---|
| `BOT_TOKEN` | токен от BotFather |
| `FRONTEND_URL` | `https://yourusername.github.io/checkers-bot` |

### Шаг 4 — Деплой

Нажми **Deploy**. После успешного деплоя скопируй URL сервиса (вида `https://checkers-backend-xxxx.onrender.com`).

> ⚠️ **Free tier** на Render засыпает после 15 минут неактивности. Первый запрос может занять 30–60 сек. Для продакшена используй платный тариф.

---

## Деплой Frontend на GitHub Pages

### Шаг 1 — Замени placeholder в game.js

Открой `frontend/game.js` и замени строку:
```javascript
const BACKEND_WS = '__BACKEND_WS__';
```
На реальный WebSocket URL твоего backend:
```javascript
const BACKEND_WS = 'wss://checkers-backend-xxxx.onrender.com';
```

> 💡 `wss://` — это WebSocket over HTTPS. Используй именно `wss://`, а не `ws://`, так как GitHub Pages работает по HTTPS.

### Шаг 2 — Настройка репозитория

1. Создай репозиторий на GitHub (например, `checkers-bot`).
2. Загрузи туда проект:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/checkers-bot.git
   git push -u origin main
   ```

### Шаг 3 — Включи GitHub Pages

1. Перейди в **Settings → Pages** твоего репозитория.
2. Source: **Deploy from a branch**.
3. Branch: `main`, папка: `/ (root)` или `/frontend` (зависит от структуры).
4. Нажми **Save**.

> Если frontend лежит в папке `frontend/`, укажи её как источник, **или** перенеси файлы в корень репозитория.

### Шаг 4 — Получи URL и обнови бота

GitHub Pages выдаст URL вида:
```
https://yourusername.github.io/checkers-bot
```

Обнови переменную `FRONTEND_URL` в настройках Render (см. выше).

### Шаг 5 — Обнови Web App URL у BotFather

```
/setmenubutton
```
Введи актуальный URL `https://yourusername.github.io/checkers-bot`.

---

## Переменные окружения

Скопируй `.env.example` в `.env` и заполни:

```env
# Токен Telegram-бота от @BotFather
BOT_TOKEN=your_bot_token_here

# URL задеплоенного backend (Render.com)
BACKEND_URL=https://your-render-app.onrender.com

# URL задеплоенного frontend (GitHub Pages)
FRONTEND_URL=https://yourusername.github.io/checkers-bot
```

| Переменная | Описание | Пример |
|---|---|---|
| `BOT_TOKEN` | Токен бота от BotFather | `123456:ABC-DEF...` |
| `BACKEND_URL` | HTTP URL backend для создания комнат | `https://app.onrender.com` |
| `FRONTEND_URL` | URL frontend для формирования ссылки в Web App кнопке | `https://user.github.io/repo` |

---

## Локальный запуск и тестирование

### Требования

- Python 3.11+
- Node.js не нужен (чистый Vanilla JS)
- [ngrok](https://ngrok.com/) или [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) для публичного HTTPS туннеля

### Установка зависимостей

```bash
cd C:\Users\ofm\.gemini\antigravity\scratch\checkers-bot
pip install -r requirements.txt
```

### Запуск backend

```bash
uvicorn server.main:app --reload --port 8000
```

Backend будет доступен на `http://localhost:8000`.

### Публичный туннель (обязательно для Telegram Web App)

Telegram требует HTTPS для Web App. Используй ngrok:

```bash
ngrok http 8000
```

Скопируй HTTPS URL (например `https://abc123.ngrok.io`) и:
1. Замени в `.env`: `BACKEND_URL=https://abc123.ngrok.io`
2. Замени в `frontend/game.js`: `const BACKEND_WS = 'wss://abc123.ngrok.io';`

### Запуск frontend локально

```bash
# Python встроенный HTTP сервер
cd frontend
python -m http.server 3000
```

Или используй туннель для frontend тоже:
```bash
ngrok http 3000
```

### Запуск бота

```bash
python -m bot.main
```

### Тестирование inline-режима

1. Открой Telegram.
2. В любом чате начни вводить: `@YourBotName` (имя твоего бота).
3. Должно появиться предложение «Шашки — создать партию».
4. Нажми на него — бот отправит сообщение с кнопкой.
5. Нажми кнопку — откроется Web App с игрой.
6. Поделись ссылкой с другом или открой в другом аккаунте.

### Проверка API вручную

```bash
# Создать комнату
curl -X POST http://localhost:8000/api/room/create

# Получить статус комнаты
curl http://localhost:8000/api/room/ROOM_ID
```

### Структура проекта

```
checkers-bot/
├── bot/                    # Telegram бот (aiogram 3)
│   ├── __init__.py
│   ├── config.py           # Переменные окружения
│   ├── main.py             # Точка входа бота
│   └── handlers/
│       ├── __init__.py
│       ├── game.py         # /start, /help
│       └── inline.py       # Inline query handler
├── server/                 # FastAPI backend
│   ├── main.py             # API + WebSocket
│   ├── game_logic.py       # Логика шашек
│   └── room_manager.py     # Управление комнатами
├── frontend/               # Web App (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── game.js
├── .env                    # Секреты (не коммитить!)
├── .env.example            # Шаблон переменных
├── requirements.txt
├── render.yaml             # Конфиг деплоя на Render
└── README.md
```

---

> 💬 Возникли вопросы? Проверь логи бота (`python -m bot.main`) и backend (`uvicorn` output). Убедись, что все переменные окружения заданы правильно.
