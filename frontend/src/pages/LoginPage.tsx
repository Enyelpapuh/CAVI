import { useState } from 'preact/hooks';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(correo, password);
    } catch (err: any) {
      const data = err.response?.data;
      const mensaje =
        data?.detail ||
        (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(' ') : '') ||
        (typeof data === 'string' ? data : '') ||
        'Credenciales inválidas. Verifique su correo y contraseña.';
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex min-h-screen bg-slate-50">
      {/* Lado A: Minimalista, sin degradados */}
      <div class="hidden w-1/2 flex-col justify-center items-center bg-slate-900 px-12 lg:flex">
        <div class="max-w-md space-y-6 text-white">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600">
            <svg fill="currentColor" viewBox="0 0 24 24" class="h-8 w-8">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </div>
          <h1 class="text-4xl font-semibold tracking-tight text-slate-50">Control y Seguridad Financiera</h1>
          <p class="text-lg text-slate-400">
            Sistema de Administración de Inversiones Crediticias diseñado para operar con simplicidad y precisión.
          </p>
        </div>
      </div>

      {/* Lado B: Formulario limpio sin bordes duros */}
      <div class="flex w-full items-center justify-center px-4 sm:px-6 lg:w-1/2 lg:px-8">
        <div class="w-full max-w-sm space-y-8">
          <div class="text-center lg:text-left">
            <h2 class="text-3xl font-bold tracking-tight text-slate-900">Bienvenido de nuevo</h2>
            <p class="mt-2 text-sm text-slate-500">
              Ingresa tus credenciales para acceder a tu panel
            </p>
          </div>

          <form class="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div class="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
            
            <div class="space-y-4">
              <div>
                <label htmlFor="correo" class="sr-only">Correo electrónico</label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  autoComplete="email"
                  required
                  value={correo}
                  onInput={(e) => setCorreo(e.currentTarget.value)}
                  class="block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
                  placeholder="Correo electrónico"
                />
              </div>
              <div>
                <label htmlFor="password" class="sr-only">Contraseña</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  class="block w-full rounded-xl border-0 bg-white px-4 py-3.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-slate-900 sm:text-sm"
                  placeholder="Contraseña"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                class="flex w-full justify-center rounded-xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span class="flex items-center gap-2">
                    <svg class="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verificando...
                  </span>
                ) : (
                  'Iniciar Sesión'
                )}
              </button>
            </div>
          </form>

          <div class="mt-8 border-t border-slate-100 pt-6 text-center text-xs text-slate-400">
            <p>Usuario de prueba: <code class="rounded bg-slate-100 px-1 py-0.5 text-slate-600">admin@cavi.local</code> / <code class="rounded bg-slate-100 px-1 py-0.5 text-slate-600">admin123</code></p>
          </div>
        </div>
      </div>
    </div>
  );
}