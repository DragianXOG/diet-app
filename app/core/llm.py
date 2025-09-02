"""
LLM integration stub for generating workout plans.

This module provides a generate_workout_plan function that can be wired to an
LLM provider in the future. For now, it deterministically creates a structured
weekly plan based on intake and preferences so the rest of the app can be
developed and tested without external calls.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional
import json
import os

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


def _fallback_plan(
    *,
    intake: Any,
    days: int,
    per_week: int,
    minutes: int,
    equipment: Dict[str, bool],
) -> List[Dict[str, Any]]:
    """
    Return a list of daily workout sessions with detailed exercises. Each entry:
      { 'date': 'YYYY-MM-DD', 'title': str, 'exercises': [{ name, machine, sets, reps, target_weight, rest_sec }] }

    This is a local deterministic generator shaped like an LLM output. Replace
    with real LLM calls later.
    """
    days = max(1, min(31, int(days)))
    per_week = max(1, min(7, int(per_week)))
    minutes = max(15, min(120, int(minutes)))

    titles = ['Upper', 'Lower', 'Push', 'Pull', 'Core']

    def ex(name, machine=None, sets=3, reps=12, tw=None, rest=60):
        return {
            'name': name,
            'machine': machine,
            'sets': sets,
            'reps': reps,
            'target_weight': tw,
            'rest_sec': rest,
        }

    def template(idx: int) -> List[Dict[str, Any]]:
        mod = idx % 5
        out: List[Dict[str, Any]] = []
        if mod == 0:  # Upper
            if equipment.get('machines') or equipment.get('smith'):
                out += [ex('Lat Pulldown', 'Lat Pulldown'), ex('Seated Row', 'Row Machine'), ex('Shoulder Press', 'Machine Press')]
            else:
                out += [ex('DB Bench Press','Dumbbells'), ex('One-Arm DB Row','Dumbbells'), ex('DB Shoulder Press','Dumbbells')]
        elif mod == 1:  # Lower
            if equipment.get('smith'):
                out += [ex('Smith Squat','Smith Machine', sets=4, reps=10), ex('Smith RDL','Smith Machine'), ex('Leg Press','Leg Press')]
            elif equipment.get('machines'):
                out += [ex('Leg Press','Leg Press'), ex('Leg Curl','Hamstring Curl'), ex('Leg Extension','Quad Extension')]
            else:
                out += [ex('Goblet Squat','Dumbbells'), ex('DB RDL','Dumbbells'), ex('Reverse Lunge','Bodyweight/Dumbbells')]
        elif mod == 2:  # Push
            out += [ex('Incline Press','Machine/Dumbbells'), ex('Lateral Raise','Dumbbells'), ex('Triceps Pushdown','Cable')]
        elif mod == 3:  # Pull
            out += [ex('Assisted Pull-Up','Assisted Pull-Up'), ex('Cable Row','Row Machine'), ex('Biceps Curl','Cable/Dumbbells')]
        else:  # Core/Conditioning
            out += [ex('Plank','Mat', sets=3, reps=45, tw=None, rest=45), ex('Cable Woodchop','Cable', sets=3, reps=12), ex('Farmer Carry','Dumbbells', sets=4, reps=40)]
        if minutes <= 30 and len(out) > 3:
            out = out[:3]
        return out

    start = date.today()
    # choose day indices evenly spaced based on per_week
    idxs = list(range(days))
    if per_week < days:
        step = days / per_week
        picks = []
        for i in range(per_week):
            x = int(round(i * step))
            if x >= days:
                x = days - 1
            if x not in picks:
                picks.append(x)
        idxs = picks

    sessions: List[Dict[str, Any]] = []
    for i in idxs:
        d = start + timedelta(days=i)
        sessions.append({
            'date': d.isoformat(),
            'title': titles[i % 5],
            'exercises': template(i),
        })
    return sessions


def generate_workout_plan(
    *,
    intake: Any,
    days: int,
    per_week: int,
    minutes: int,
    equipment: Dict[str, bool],
) -> List[Dict[str, Any]]:
    """
    If OPENAI_API_KEY is present and OpenAI SDK is available, ask the model to
    produce a JSON plan. Otherwise, return the deterministic fallback plan.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return _fallback_plan(intake=intake, days=days, per_week=per_week, minutes=minutes, equipment=equipment)

    try:
        client = OpenAI(api_key=api_key)
        # PhD Coach v3.27 framing for workouts
        sys = (
            "You are the PhD Coach v3.27. Use S3N workout logic (specificity, progressive overload, fatigue management) "
            "and return strictly JSON. Never include prose outside JSON. JSON schema: {\"sessions\":[{\"date\":\"YYYY-MM-DD\",\"title\":str,\"exercises\":[{\"name\":str,\"machine\":str|null,\"sets\":int,\"reps\":int,\"rpe\":int|null,\"rest_sec\":int}]}]}. "
            "Respect user's equipment, gym context, preferred session minutes and frequency. Prefer machines at Planet Fitness; "
            "avoid movements unavailable there. Keep each session 2–6 exercises and trim to fit minutes."
        )
        # Extract minimal prefs
        gym = getattr(intake, 'gym', None)
        notes = (getattr(intake, 'workout_notes', '') or '')
        goals = (getattr(intake, 'goals', '') or '')
        start = date.today().isoformat()
        user_prefs = {
            'start': start,
            'days': days,
            'sessions_per_week': per_week,
            'session_minutes': minutes,
            'preferred_time': getattr(intake, 'workout_time', None) or '06:00',
            'gym': gym,
            'equipment': equipment,
            'notes': notes,
            'goals': goals,
        }
        messages = [
            {"role": "system", "content": sys},
            {"role": "user", "content": f"Preferences: {json.dumps(user_prefs)}"},
        ]
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        txt = resp.choices[0].message.content or "{}"
        data = json.loads(txt)
        sessions = data.get('sessions') or []
        # Basic normalization
        out: List[Dict[str, Any]] = []
        for s in sessions:
            try:
                d = s.get('date') or start
                t = s.get('title') or 'Workout'
                exs = s.get('exercises') or []
                out.append({'date': d, 'title': t, 'exercises': exs})
            except Exception:
                continue
        if not out:
            return _fallback_plan(intake=intake, days=days, per_week=per_week, minutes=minutes, equipment=equipment)
        return out
    except Exception:
        # Any failure → fallback plan
        return _fallback_plan(intake=intake, days=days, per_week=per_week, minutes=minutes, equipment=equipment)


def generate_diet_plan(
    *,
    intake: Any,
    days: int,
    meals_per_day: int,
    avoids: List[str],
    calorie_target: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    """Optional LLM-based diet plan generator following PhD Coach v3.27.
    Returns a dict with keys: label, start, end, days (list of {date, meals:[{time,title,kcal,ingredients,steps}]})
    or None on failure/unavailable.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or OpenAI is None:
        return None
    try:
        client = OpenAI(api_key=api_key)
        sys = (
            "You are the PhD Coach v3.27 using the NSSN nutrition framework. "
            "Generate a compact JSON meal plan for the user. Respect avoid_ingredients strictly (exclude or substitute). "
            "Aim for balanced micronutrients unless user notes indicate low-carb or diabetic focus; then bias carbs lower. "
            "Match the daily calorie target (calorie_target) within ±5% across the day's meals. "
            "Output strictly JSON with top-level key 'days' (array) where each item is {date, meals}. "
            "Each meal is {time: 'HH:MM', title, kcal: int, ingredients: [string], steps: [string]}."
        )
        # Extract preferences
        notes = (getattr(intake, 'food_notes', '') or '')
        diabetic = bool(getattr(intake, 'diabetic', False))
        mpd = max(1, min(8, int(meals_per_day or 3)))
        start = date.today().isoformat()
        payload = {
            'days': int(days),
            'meals_per_day': mpd,
            'avoid_ingredients': [a for a in avoids if a],
            'diabetic': diabetic,
            'notes': notes,
            'calorie_target': int(calorie_target) if calorie_target else None,
        }
        # calorie_target provided by caller; LLM should match within ±5%.
        messages = [
            {"role": "system", "content": sys},
            {"role": "user", "content": json.dumps(payload)},
        ]
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        txt = resp.choices[0].message.content or "{}"
        data = json.loads(txt)
        days_arr = data.get('days') or []
        if not isinstance(days_arr, list) or not days_arr:
            return None
        # Sanitize minimal shape
        out_days: List[Dict[str, Any]] = []
        for d in days_arr:
            try:
                date_str = d.get('date') or start
                meals_list = d.get('meals') or []
                norm_meals = []
                for m in meals_list:
                    norm_meals.append({
                        'time': m.get('time') or '12:00',
                        'title': m.get('title') or 'Meal',
                        'kcal': int(m.get('kcal') or 500),
                        'ingredients': m.get('ingredients') or [],
                        'steps': m.get('steps') or [],
                    })
                out_days.append({'date': date_str, 'meals': norm_meals})
            except Exception:
                continue
        if not out_days:
            return None
        return {
            'label': 'PhD Coach Plan',
            'start': out_days[0]['date'],
            'end': out_days[-1]['date'],
            'days': out_days,
            'window': {'start': out_days[0]['date'], 'end': out_days[-1]['date']},
        }
    except Exception:
        return None
