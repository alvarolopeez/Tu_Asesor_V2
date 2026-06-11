"use client";

import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { Lock } from "lucide-react";

// Brief #011 F3.0: gate de auth client-side extraído de AdminDashboard.
// ⚠️ proxy.ts NO protege /admin/* (passthrough) — este componente es la única
// barrera. Toda ruta nueva bajo /admin debe envolverse en él.
//
// Contrato:
// - Comprueba sesión Supabase al montar → muestra el form de login si no hay.
// - `onAuthenticated` se dispara cada vez que se confirma el acceso (sesión
//   existente, login correcto o bypass dev) — AdminDashboard cuelga aquí su
//   fetchData, igual que antes de la extracción.
// - `children` puede ser un nodo o una función `({ logout }) => nodo` para
//   quien necesite el botón de cerrar sesión (la sidebar del dashboard).

type AuthGateRenderCtx = { logout: () => Promise<void> };

interface AdminAuthGateProps {
  children: ReactNode | ((ctx: AuthGateRenderCtx) => ReactNode);
  onAuthenticated?: () => void;
}

export default function AdminAuthGate({ children, onAuthenticated }: AdminAuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grantAccess = () => {
    setIsAuthenticated(true);
    onAuthenticated?.();
  };

  const checkSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      grantAccess();
    } else {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthError("Credenciales incorrectas.");
      setAuthLoading(false);
    } else {
      grantAccess();
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="bg-[#1E293B] p-8 rounded-2xl border border-white/10 w-full max-w-md shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#FBBF24] rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-[#2C3E50]" />
            </div>
            <h1 className="text-2xl font-bold text-white">Acceso Administrativo</h1>
            <p className="text-slate-400 text-sm mt-2">Introduce tus credenciales para acceder al panel.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg text-center">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                placeholder="tu@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#0F172A] border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-[#FBBF24] transition-all"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-[#FBBF24] hover:bg-yellow-500 text-[#2C3E50] font-bold py-3 rounded-xl transition-all disabled:opacity-50 mt-4"
            >
              {authLoading ? 'Verificando...' : 'Entrar al Dashboard'}
            </button>

            {process.env.NODE_ENV === "development" && (
              <button
                type="button"
                onClick={grantAccess}
                className="w-full bg-slate-800 hover:bg-slate-700 text-[#FBBF24] font-bold py-2.5 rounded-xl border border-white/5 transition-all mt-2 text-xs"
              >
                🛠️ Auto-Bypass (Desarrollo)
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  return <>{typeof children === "function" ? children({ logout }) : children}</>;
}
