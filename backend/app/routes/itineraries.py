from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from app.database import supabase, get_user_supabase_client
from app.services.groq_service import generate_itinerary_for_trip
from app.schemas.itinerary import ItineraryResponseSchema

router = APIRouter(prefix="/itineraries", tags=["Itineraries"])


def get_authenticated_user_and_token(authorization: Optional[str] = Header(None)):
    """Extract and verify Supabase JWT bearer token, returning user and raw token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Authorization header with Bearer token is required."
        )

    token = authorization.split("Bearer ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is missing."
        )

    if supabase is None:
        raise HTTPException(
            status_code=500,
            detail="Supabase client is not configured on the backend server. Check backend/.env."
        )

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=401,
                detail="Invalid or expired session. Please log in again."
            )
        return user_response.user, token
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Authentication error: {str(exc)}"
        )


@router.post("/{trip_id}/generate", response_model=ItineraryResponseSchema)
@router.post("/generate/{trip_id}", response_model=ItineraryResponseSchema)
def generate_itinerary_endpoint(
    trip_id: str,
    user_and_token=Depends(get_authenticated_user_and_token)
):
    """
    Generate an AI day-wise itinerary for the specified trip.
    Verifies that the caller owns the trip before generating or updating anything.
    Saves the resulting itinerary to trips.itinerary JSONB column in Supabase.
    """
    user, token = user_and_token
    user_client = get_user_supabase_client(token)

    # 1. Fetch trip using user-authenticated client (RLS-aware)
    try:
        response = user_client.table("trips").select("*").eq("id", trip_id).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query trip from database: {str(exc)}"
        )

    if not response.data or len(response.data) == 0:
        raise HTTPException(
            status_code=404,
            detail="Trip not found or you do not have permission to access it."
        )

    trip = response.data[0]

    # Explicit ownership check
    if str(trip.get("user_id")) != str(user.id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You can only generate itineraries for your own trips."
        )

    # 2. Generate itinerary with Groq AI service
    itinerary_data = generate_itinerary_for_trip(trip)

    # 3. Save the itinerary into the trips.itinerary JSONB column
    try:
        update_response = user_client.table("trips").update({
            "itinerary": itinerary_data
        }).eq("id", trip_id).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Itinerary generated, but failed to save to database: {str(exc)}"
        )

    return {
        "message": "Itinerary generated and saved successfully",
        "trip_id": trip_id,
        "itinerary": itinerary_data
    }


@router.get("/{trip_id}")
def get_trip_itinerary(
    trip_id: str,
    user_and_token=Depends(get_authenticated_user_and_token)
):
    """Retrieve the saved itinerary for a specific trip."""
    user, token = user_and_token
    user_client = get_user_supabase_client(token)

    try:
        response = user_client.table("trips").select("id, user_id, destination, itinerary").eq("id", trip_id).execute()
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Database query error: {str(exc)}"
        )

    if not response.data or len(response.data) == 0:
        raise HTTPException(
            status_code=404,
            detail="Trip not found."
        )

    trip = response.data[0]
    if str(trip.get("user_id")) != str(user.id):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: You do not own this trip."
        )

    return {
        "trip_id": trip_id,
        "destination": trip.get("destination"),
        "itinerary": trip.get("itinerary")
    }
