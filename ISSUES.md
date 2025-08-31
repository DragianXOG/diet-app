# Issues Log — Life – Health
Updated: 2025-08-30 06:10 CDT

## Open Issues

### 1) Auth overlay — Signup vs Login button inconsistent
**Symptom:** “New User” button is colored/behaves differently than “Login — Existing User”.  
**Expected:** Both use shared Button (green idle → purple hover), identical size/spacing/behavior.  
**Status:** Switched both to shared `<Button>`; overlay may still apply inline styles that conflict.

### 2) Intake form — defaults & persistence incorrect
**Symptom:** Clicking the Intake tab/header shows defaults (age/sex/height/weight/diabetic/conditions/goals/zip/gym). Name/meds can be blank or stale defaults.  
**Expected:** No UI defaults. Values come from Intake form (user input or server GET) and persist across tabs; never revert to placeholder defaults once set.  
**Action plan:** Remove hardcoded defaults; on mount, if token → GET `/api/v1/intake` and prime form; persist to `localStorage` and reuse everywhere.

### 3) Intake “Save to API” button — color still not correct
**Symptom:** Button snapshot shows green bg + white text/icon but still flagged as “wrong color”.  
**Expected:** Green idle `#48A860` with white text/icon; purple hover `#4B0082` with white text/icon; consistent across the app.  
**Action plan:** Ensure no inline overrides or conflicting classes; verify computed styles.

### 4) Meal Plan — “Build / Refresh” button styling & UX
**Symptom:** Button appears white-on-white; clicking shows “Set user ID in settings first.”  
**Expected:** Shared Button styling. User ID should auto-populate after signup/login via `/api/v1/auth/me` (no manual step).  
**Action plan:** After auth, call `/api/v1/auth/me`, store `{id, email}` in app state/localStorage; update Meal Plan module to use that.

### 5) Groceries — not auto-generated; API sync fails
**Symptom:** No initial list. “Sync from API” → “Could not load from api/v1/groceries; using local list only.”  
**Expected:** When authenticated, load `/api/v1/groceries` with Bearer token; display server list; full CRUD; only fall back to local if API truly unavailable.  
**Action plan:** Wire `Authorization` header in groceries API calls; add loader/empty state.

### 6) Workouts — too generic; needs machine-level detail & tracking
**Symptom:** “Crunch Fitness (6:00–7:00 PM): full-body circuit …” only.  
**Expected:** Machine-level plan (e.g., “Leg Press — 3×15 @ 250 lb”), fields to log actual weight/reps, progressive overload suggestions.  
**Action plan:** Add workout schema (exercise, sets, reps, target weight), UI for logging, persistence; auto-suggest next session loads.

### 7) Trackers — should inherit workout context
**Symptom:** Trackers don’t reflect specific workout sets/reps/weights.  
**Expected:** Trackers prefill from plan; user logs results; charts show progress; drive next-plan adjustments.

## Planned Fix Order
A. Intake state & persistence (remove defaults; prime from server; single source of truth).  
B. Auto userId and auth context (`/auth/me`) so modules don’t ask user to set it.  
C. Button styling parity across all primary actions (use shared `Button` everywhere).  
D. Groceries API wiring (Bearer headers; better errors).  
E. Workouts/Trackers detailed model + UI.

## Done
- Intake **Save** wired to single POST `/api/v1/intake` with Bearer; end-to-end verified.

