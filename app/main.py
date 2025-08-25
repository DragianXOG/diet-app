import os, time
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()
PORT = int(os.getenv("PORT","8010"))

app = FastAPI(title="Diet App", version="0.1.0")

@app.get("/")
def read_root():
    return {"ok": True, "app": "diet-app", "version": app.version}

@app.get("/health")
def health():
    return {"ok": True, "ts": int(time.time())}
