# Set-Content -Path "main.py" -Value @"
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Agentic Enterprise Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Item(BaseModel):
    name: str
    description: str = None

@app.get("/")
def root():
    return {"message": "Enterprise API Operational", "version": "1.0.0"}

@app.get("/items")
def get_items():
    return [{"id": 1, "name": "Strategic Analysis"}, {"id": 2, "name": "Risk Assessment"}]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
