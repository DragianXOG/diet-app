import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import App from './App.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Intake from './pages/Intake.jsx'

function hasToken(){ return localStorage.getItem("diet.app.session")==="v2"; }

function RequireAuth({ children }) {
  return hasToken() ? children : <Navigate to="/" replace />;
}
function RedirectIfAuthed({ children }) {
  return hasToken() ? <Navigate to="/app" replace /> : children;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RedirectIfAuthed><Landing /></RedirectIfAuthed>} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
        <Route path="/intake" element={<RequireAuth><Intake /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
