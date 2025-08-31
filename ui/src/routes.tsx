// src/routes.tsx
import { createBrowserRouter, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Intake from "./pages/Intake";
import Home from "./pages/Home";

// Always require login — dump tokens on every load
function isLoggedIn() {
  // keep token for this session; remove on explicit logout
  return !!localStorage.getItem("diet.token");
}

export const router = (state: { hasIntake: boolean }) =>
  createBrowserRouter([
    { path: "/", element: <Landing /> },
    {
      path: "/login",
      element: <Login />,
    },
    {
      path: "/signup",
      element: <Signup />,
    },
    {
      path: "/intake",
      element: isLoggedIn() ? <Intake /> : <Navigate to="/login" />,
    },
    {
      path: "/app",
      element: isLoggedIn() ? <Home /> : <Navigate to="/login" />,
    },
  ]);
