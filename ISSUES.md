# Issues Log — Life – Health
Updated: 2025-08-30 06:10 CDT

## Open Issues

### 1) Landing buttons — styling consistency
**Symptom:** Primary actions inconsistent in earlier designs.  
**Expected:** Shared Button styles (green idle → purple hover), identical size/spacing/behavior.

### 2) Intake form — defaults & persistence incorrect
**Symptom:** Clicking the Intake tab/header shows defaults (age/sex/height/weight/diabetic/conditions/goals/zip/gym). Name/meds can be blank or stale defaults.  
**Expected:** No UI defaults. Values come from Intake form (user input or server GET) and persist across tabs; never revert to placeholder defaults once set.  
**Action plan:** Remove hardcoded defaults; no prepopulation; persist user-entered values after save.

### 3) Intake “Save to API” button — color still not correct
**Symptom:** Button snapshot shows green bg + white text/icon but still flagged as “wrong color”.  
**Expected:** Green idle `#48A860` with white text/icon; purple hover `#4B0082` with white text/icon; consistent across the app.  
**Action plan:** Ensure no inline overrides or conflicting classes; verify computed styles.

### 4) Meal Plan — “Build / Refresh” button styling & UX
**Symptom:** Button appears white-on-white in some themes.  
**Expected:** Shared Button styling; clear feedback while generating plans.

### 5) Groceries — not auto-generated; API sync fails
**Symptom:** No initial list in some scenarios.  
**Expected:** Load `/api/v1/groceries`; display server list; full CRUD; fall back to local only if API unavailable.  
**Action plan:** Improve error handling and loaders.

### 6) Workouts — too generic; needs machine-level detail & tracking
**Symptom:** “Crunch Fitness (6:00–7:00 PM): full-body circuit …” only.  
**Expected:** Machine-level plan (e.g., “Leg Press — 3×15 @ 250 lb”), fields to log actual weight/reps, progressive overload suggestions.  
**Action plan:** Add workout schema (exercise, sets, reps, target weight), UI for logging, persistence; auto-suggest next session loads.

### 7) Trackers — should inherit workout context
**Symptom:** Trackers don’t reflect specific workout sets/reps/weights.  
**Expected:** Trackers prefill from plan; user logs results; charts show progress; drive next-plan adjustments.

## Planned Fix Order
A. Intake state & persistence (remove defaults; single source of truth).  
B. Button styling parity across all primary actions (use shared `Button` everywhere).  
C. Groceries API reliability (better errors, loaders).  
D. Workouts/Trackers detailed model + UI.

## Done
- Intake **Save** wired to POST `/api/v1/intake_open`; end-to-end verified in LAN mode.
