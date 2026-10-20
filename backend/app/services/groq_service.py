import os
import json
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any

from fastapi import HTTPException
from groq import Groq, APIError
from app.schemas.itinerary import ItinerarySchema

# Configure module logger (avoid duplicate handlers)
logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

def calculate_trip_duration(start_date_str: str, end_date_str: str) -> tuple[int, list[str]]:
    """Calculate the number of days and list of date strings (YYYY-MM-DD) between start and end date."""
    try:
        start = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        if end < start:
            start, end = end, start
        duration = (end - start).days + 1
        # Bound between 1 and 14 days to prevent token overruns
        duration = max(1, min(duration, 14))
        date_list = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(duration)]
        return duration, date_list
    except Exception:
        # Fallback if dates cannot be parsed
        today = datetime.now().date()
        return 3, [(today + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(3)]

def _extract_json(content: str) -> str:
    """Return a clean JSON string from a possibly wrapped LLM response.
    The model may return code fences (```json ...```), extra text, or trailing whitespace.
    """
    # Remove any markdown code fences
    if "```" in content:
        # Find the first occurrence of an opening fence and the last closing fence
        fences = re.findall(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL)
        if fences:
            return fences[0]
    # Fallback: find the first { and the last } and slice
    first = content.find('{')
    last = content.rfind('}')
    if first != -1 and last != -1 and last > first:
        return content[first:last+1]
    # If we cannot locate, return the original content (will raise JSON error later)
    return content

def generate_itinerary_for_trip(trip: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate a tailored day-wise travel itinerary using Groq API.
    Uses destination, dates, budget, group size, travel style, and pace.
    """
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key or not groq_api_key.strip():
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY is not configured in backend/.env. Please add your Groq API key."
        )

    destination = trip.get("destination") or "Unknown Destination"
    start_date = str(trip.get("start_date") or "")
    end_date = str(trip.get("end_date") or "")
    daily_budget = trip.get("daily_budget") or "Moderate"
    currency = trip.get("currency") or "USD"
    group_size = trip.get("group_size") or 1
    travel_style = trip.get("travel_style") or "Relaxation"
    pace = trip.get("pace") or "Moderate"

    num_days, date_list = calculate_trip_duration(start_date, end_date)

    # Activity count recommendation based on pace
    pace_activities = {
        "Relaxed": "2 activities per day with ample free time",
        "Moderate": "3 activities per day balanced with rest",
        "Fast": "4 to 5 activities per day covering maximum sights",
    }.get(pace, "3 activities per day")

    system_prompt = (
        "You are an expert personalized travel planner. "
        "You generate detailed, highly practical day-by-day travel itineraries. "
        "You must output ONLY valid JSON matching the exact requested schema."
    )

    user_prompt = f"""
Generate a personalized {num_days}-day travel itinerary for this trip:
- Destination: {destination}
- Dates: {date_list[0]} to {date_list[-1]} ({num_days} days)
- Daily Budget: {daily_budget} {currency}
- Group Size: {group_size} person(s)
- Travel Style: {travel_style}
- Pace: {pace} ({pace_activities})

Requirements:
1. Provide a plan for exactly {num_days} days.
2. For each day, include:
   - day_number: integer starting from 1 to {num_days}
   - date: corresponding date string from: {date_list}
   - title: a catchy theme for that day (e.g., "Coastal Highlights & Sunset Walk")
   - activities: array of activities matching the {travel_style} style and {pace} pace.
3. For each activity, include:
   - time: realistic time range (e.g., "09:00 AM - 11:30 AM")
   - title: specific name of attraction or activity
   - description: 2-3 engaging sentences describing the experience
   - category: one of [Sightseeing, Culture, Nature, Food & Dining, Relaxation, Adventure]
   - estimated_cost: realistic cost estimate per person in {currency} or 'Free'
4. Organize activities in logical geographic order to minimize travel fatigue.

Return strictly a valid JSON object matching this schema:
{{
  "destination": "{destination}",
  "summary": "2-3 sentence overview of the trip experience",
  "total_days": {num_days},
  "days": [
    {{
      "day_number": 1,
      "date": "{date_list[0]}",
      "title": "Day title",
      "activities": [
        {{
          "time": "09:00 AM - 11:30 AM",
          "title": "Activity name",
          "description": "Activity description...",
          "category": "Sightseeing",
          "estimated_cost": "Free or amount with {currency}"
        }}
      ]
    }}
  ]
}}
"""

    schema = {
        "type": "json_schema",
        "json_schema": {
            "name": "itinerary_response",
            "schema": ItinerarySchema.model_json_schema(),
        },
    }

    client = Groq(api_key=groq_api_key.strip())
    max_retries = 2
    last_error_msg = ""

    def _normalize_activity(act: dict) -> dict:
        mapping = {
            "name": "title",
            "activity_name": "title",
            "time_range": "time",
            "cost": "estimated_cost",
            "price": "estimated_cost",
        }
        for src, dst in mapping.items():
            if src in act and dst not in act:
                act[dst] = act.pop(src)
        return act

    for attempt in range(max_retries):
        try:
            logger.info("Calling Groq API (model: openai/gpt-oss-120b, attempt %d/%d)", attempt + 1, max_retries)
            chat_completion = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format=schema,
                temperature=0.7,
                max_tokens=4000,
            )
        except APIError as api_err:
            err_text = getattr(api_err, "message", str(api_err))
            logger.error("Groq API error on attempt %d: %s", attempt + 1, err_text)
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=502,
                    detail=f"Groq API error: {err_text}",
                )
            continue
        except Exception as exc:
            logger.error("Unexpected error communicating with Groq on attempt %d: %s", attempt + 1, str(exc))
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to communicate with AI service: {str(exc)}",
                )
            continue

        content = chat_completion.choices[0].message.content
        if not content:
            logger.warning("Attempt %d returned empty content from Groq model", attempt + 1)
            last_error_msg = "AI service returned an empty response."
            continue

        cleaned_content = _extract_json(content)

        try:
            parsed_json = json.loads(cleaned_content)
        except json.JSONDecodeError as decode_err:
            logger.error(
                "JSON decode error on attempt %d: '%s' at line %d column %d (char %d)",
                attempt + 1,
                decode_err.msg,
                decode_err.lineno,
                decode_err.colno,
                decode_err.pos,
            )
            last_error_msg = f"JSON decode error at line {decode_err.lineno} column {decode_err.colno}: {decode_err.msg}"
            continue

        try:
            if isinstance(parsed_json, dict) and "days" in parsed_json:
                for day in parsed_json.get("days", []):
                    if isinstance(day, dict) and "activities" in day:
                        day["activities"] = [_normalize_activity(a) for a in day.get("activities", []) if isinstance(a, dict)]

            validated_itinerary = ItinerarySchema.model_validate(parsed_json)
            # Verify that each day contains real activities
            if not validated_itinerary.days or not any(d.activities for d in validated_itinerary.days):
                logger.warning("Attempt %d produced itinerary with empty activities, retrying", attempt + 1)
                last_error_msg = "Itinerary contained no activities."
                continue

            return validated_itinerary.model_dump()
        except Exception as val_err:
            logger.error("Schema validation failed on attempt %d: %s", attempt + 1, str(val_err))
            last_error_msg = f"Schema validation error: {str(val_err)}"
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Failed to parse structured itinerary from AI response after {max_retries} attempts: {last_error_msg}",
    )
