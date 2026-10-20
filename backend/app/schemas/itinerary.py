from typing import List, Optional
from pydantic import BaseModel, Field


class ActivitySchema(BaseModel):
    time: str = Field(..., description="Suggested time window, e.g., '09:00 AM - 11:30 AM'")
    title: str = Field(..., description="Activity or location title")
    description: str = Field(..., description="Brief description of the activity")
    category: Optional[str] = Field("Sightseeing", description="Category: Culture, Relaxation, Adventure, Food & Dining, Sightseeing, etc.")
    estimated_cost: Optional[str] = Field(None, description="Estimated cost for the activity (e.g., 'Free', '500 INR')")


class DayPlanSchema(BaseModel):
    day_number: int = Field(..., description="Day number (e.g., 1, 2, 3)")
    date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")
    title: str = Field(..., description="Theme or main focus of the day")
    activities: List[ActivitySchema] = Field(default_factory=list, description="List of activities for the day")


class ItinerarySchema(BaseModel):
    destination: str = Field(..., description="Destination city or region")
    summary: str = Field(..., description="Brief overview of the planned trip")
    total_days: int = Field(..., description="Total number of days")
    days: List[DayPlanSchema] = Field(default_factory=list, description="Day-by-day plan")


class ItineraryResponseSchema(BaseModel):
    message: str
    trip_id: str
    itinerary: ItinerarySchema
