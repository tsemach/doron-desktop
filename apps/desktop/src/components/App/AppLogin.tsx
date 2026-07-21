import { Routes, Route } from "react-router-dom";
import AuthLanding from "../Auth/AuthLanding";
import Login from "../Auth/Login";

export default function AppLogin() {
  return (
    <Routes>
      <Route path="/auth/login" element={<Login />} />
      <Route path="*" element={<AuthLanding />} />
    </Routes>
  );
}
