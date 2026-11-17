import asyncio
import websockets
import json

async def main():
    url = "wss://demo.piesocket.com/v3/checkers_test_room?api_key=VC3Ot8gAnfnuuzKMrMqEdXxAVjvDv5GWiqqki6aS&notify_self=1"
    try:
        async with websockets.connect(url) as ws:
            print("Connected to PieSocket!")
            await ws.send(json.dumps({"event": "presence", "user": "konstantin"}))
            msg = await asyncio.wait_for(ws.recv(), timeout=5)
            print("Received from PieSocket:", msg)
    except Exception as e:
        print("PieSocket error:", e)

if __name__ == "__main__":
    asyncio.run(main())
