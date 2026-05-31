from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI(title="Agentic Enterprise Backend")

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