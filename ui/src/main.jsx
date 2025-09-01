import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import Privacy from "./pages/Privacy.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Intake from "./pages/Intake.jsx";
import "./index.css";
import Header from "./components/Header.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/intake" element={<RequireAuth><Intake /></RequireAuth>} />
        <Route path="/app" element={<RequireAuth><App /></RequireAuth>} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
