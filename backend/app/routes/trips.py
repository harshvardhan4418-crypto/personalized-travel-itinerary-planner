
from fastapi import APIRouter, HTTPException
from app.database import supabase

router = APIRouter(prefix="/trips", tags=["Trips"])


@router.get("/")
def get_trips():
    if supabase is None:
        raise HTTPException(
            status_code=500,
            detail="Supabase is not configured. Check backend/.env."
        )

    try:
        response = supabase.table("trips").select("*").execute()
        return {"trips": response.data}
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch trips: {str(error)}"
        )
