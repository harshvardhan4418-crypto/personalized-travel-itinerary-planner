
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.trips import router as trips_router
from app.routes.itineraries import router as itineraries_router

app = FastAPI(
    title="Personalized Travel Itinerary Planner API",
    version="1.0.0",
    description="Backend API for generating personalized travel itineraries."
)

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url and frontend_url.strip():
    for url in frontend_url.split(","):
        cleaned_url = url.strip().rstrip("/")
        if cleaned_url and cleaned_url not in allowed_origins:
            allowed_origins.append(cleaned_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(trips_router)
app.include_router(itineraries_router)

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "message": "Personalized Travel Itinerary Planner API is running"
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}
