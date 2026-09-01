import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../api/client";
import { GradientLogo } from "../components/branding/GradientLogo";
import { AppBackground } from "../components/branding/AppBackground";
import { GRADIENT_BUTTON } from "../constants/brandStyles";

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state as LocationState | null;
  const redirectTo = state?.from?.pathname || "/workspace";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Incorrect username or password." : "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center px-6 font-['Manrope',sans-serif]">
      <AppBackground />
      <div className="relative z-10 max-w-md w-full bg-white/85 backdrop-blur-xl border border-white/80 shadow-xl rounded-2xl p-8">
        <div className="text-center mb-8">
          <GradientLogo onClick={() => navigate("/")} />
          <p className="mt-2 text-sm text-slate-600">Sign in to your workspace</p>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <button type="submit" disabled={isSubmitting} className={`w-full mt-2 rounded-lg py-2.5 text-sm ${GRADIENT_BUTTON} disabled:opacity-50`}>
            {isSubmitting ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button onClick={() => navigate("/")} className="text-xs text-slate-500 hover:text-slate-800 transition">← Back to Home</button>
        </div>
      </div>
    </div>
  );
}