# Personalized Travel Itinerary Planner

An AI-powered travel itinerary planner that generates custom travel plans, schedules, and destination recommendations tailored to user preferences and travel constraints.

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Python + FastAPI
- **Database**: Supabase
- **AI Engine**: Groq API
- **Images**: Unsplash API

---

## Project Structure

```text
travel-itinerary-planner/
├── backend/
│   ├── app/
│   │   ├── routes/       # API endpoints and route definitions
│   │   ├── schemas/      # Pydantic data models and schemas
│   │   ├── services/     # Business logic, Groq AI, and Unsplash integrations
│   │   ├── __init__.py
│   │   └── main.py       # FastAPI application entrypoint
│   └── requirements.txt  # Python backend dependencies
├── frontend/
│   ├── public/           # Static public assets
│   ├── src/
│   │   ├── assets/       # Icons and images
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Application view/page components
│   │   ├── services/     # API integration and client service modules
│   │   ├── App.css
│   │   ├── App.jsx       # Root React component
│   │   ├── index.css
│   │   └── main.jsx      # React entrypoint
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## Getting Started

### 1. Frontend Setup
1. Navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### 2. Backend Setup
1. Navigate to the `backend` folder:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Start the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload
   ```
   The backend API will be available at `http://127.0.0.1:8000` with interactive docs at `http://127.0.0.1:8000/docs`.
