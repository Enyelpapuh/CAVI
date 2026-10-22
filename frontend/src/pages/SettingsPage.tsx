import { useState, useEffect } from 'preact/hooks';
import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Icon, Spinner } from '../components/ui';
import { configuracionService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const { hasRole } = useAuth();
  const esAdmin = hasRole('ADMINISTRADOR');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Estados de configuración
  const [modoEstricto, setModoEstricto] = useState(false);
  const [permitirSuperarUsura, setPermitirSuperarUsura] = useState(true);
  const [tasaMaximaLegal, setTasaMaximaLegal] = useState('0.0300');
  const [diasGracia, setDiasGracia] = useState(4);
  const [permitirPlazoIndefinido, setPermitirPlazoIndefinido] = useState(true);
  const [tasaMoraDiaria, setTasaMoraDiaria] = useState('0.0050');
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null);

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await configuracionService.get();
      setModoEstricto(data.modo_estricto);
      setPermitirSuperarUsura(data.permitir_superar_usura);
      setTasaMaximaLegal(data.tasa_maxima_legal);
      setDiasGracia(data.dias_gracia);
      setPermitirPlazoIndefinido(data.permitir_plazo_indefinido);
      setTasaMoraDiaria(data.tasa_mora_diaria);
      setActualizadoEn(data.actualizado_en);
    } catch {
      setErrorMsg('No se pudo cargar la configuración del sistema.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardar = async (e: Event) => {
    e.preventDefault();
    if (!esAdmin) return;

    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const updated = await configuracionService.update({
        modo_estricto: modoEstricto,
        permitir_superar_usura: permitirSuperarUsura,
        tasa_maxima_legal: tasaMaximaLegal,
        dias_gracia: Number(diasGracia),
        permitir_plazo_indefinido: permitirPlazoIndefinido,
        tasa_mora_diaria: tasaMoraDiaria,
      });

      setModoEstricto(updated.modo_estricto);
      setPermitirSuperarUsura(updated.permitir_superar_usura);
      setTasaMaximaLegal(updated.tasa_maxima_legal);
      setDiasGracia(updated.dias_gracia);
      setPermitirPlazoIndefinido(updated.permitir_plazo_indefinido);
      setTasaMoraDiaria(updated.tasa_mora_diaria);
      setActualizadoEn(updated.actualizado_en);

      setSuccessMsg('Políticas y configuración del sistema guardadas correctamente.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch {
      setErrorMsg('Ocurrió un error al guardar los cambios de configuración.');
    } finally {
      setSaving(false);
    }
  };

  const tasaLegalPorc = (Number(tasaMaximaLegal) * 100).toFixed(2);
  const tasaMoraPorc = (Number(tasaMoraDiaria) * 100).toFixed(2);

  return (
    <Layout titulo="Configuración del Sistema">
      <PageHeader
        titulo="Configuración del Sistema"
        descripcion="Parámetros operativos, políticas de tasas y días de gracia."
      />

      {loading ? (
        <div class="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div class="max-w-4xl mx-auto mt-4 space-y-3.5 pb-10">
          {/* Mensaje de permisos si no es admin */}
          {!esAdmin && (
            <div class="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2.5">
              <Icon name="warning" class="text-amber-600 w-4 h-4 shrink-0" />
              <p class="text-xs text-amber-900 font-medium">
                Solo el rol <strong>ADMINISTRADOR</strong> tiene permisos para modificar los parámetros y políticas del sistema.
              </p>
            </div>
          )}

          {/* Mensaje de éxito */}
          {successMsg && (
            <div class="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-2.5">
              <Icon name="check_circle" class="text-emerald-600 w-4 h-4 shrink-0" />
              <span class="text-xs text-emerald-900 font-semibold">{successMsg}</span>
            </div>
          )}

          {/* Mensaje de error */}
          {errorMsg && (
            <div class="bg-rose-50 border border-rose-200 rounded-md p-3 flex items-center gap-2.5">
              <Icon name="error" class="text-rose-600 w-4 h-4 shrink-0" />
              <span class="text-xs text-rose-900 font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Barra Resumen Compacta */}
          <div class="bg-white rounded-lg border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-500 text-[11px] uppercase">Modo Activo:</span>
              <span
                class={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  modoEstricto
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {modoEstricto ? 'Modo Estricto BCN' : 'Digitalización Flexible'}
              </span>
            </div>

            <div class="flex items-center gap-4 text-slate-600">
              <span><strong>Gracia:</strong> {diasGracia}d</span>
              <span><strong>Usura:</strong> {permitirSuperarUsura ? 'Tolerancia (10%)' : `${tasaLegalPorc}% BCN`}</span>
              <span><strong>Cuota Abierta:</strong> {permitirPlazoIndefinido ? 'Sí' : 'No'}</span>
            </div>
          </div>

          <form onSubmit={handleGuardar} class="space-y-3.5">
            {/* 1. MODO OPERATIVO */}
            <div class="bg-white rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon name="tune" size={18} class="text-indigo-600" />
                  Modo Operativo del Sistema
                </h3>
                <span class={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  modoEstricto ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'
                }`}>
                  {modoEstricto ? 'Modo Estricto BCN' : 'Digitalización Flexible'}
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Opción Flexible */}
                <div
                  onClick={() => esAdmin && setModoEstricto(false)}
                  class={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    !modoEstricto
                      ? 'border-amber-500 bg-amber-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div class="flex items-center gap-2.5">
                    <Icon name="description" size={20} class={!modoEstricto ? 'text-amber-700' : 'text-slate-400'} />
                    <div>
                      <span class="text-xs font-bold text-slate-900 block">Modo Flexible (Digitalización)</span>
                      <span class="text-[11px] text-slate-500">Permite tasas pactadas como el 10% mensual sin bloqueos</span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="modo"
                    checked={!modoEstricto}
                    disabled={!esAdmin}
                    onChange={() => setModoEstricto(false)}
                    class="h-4 w-4 text-amber-600 focus:ring-amber-500 border-slate-300"
                  />
                </div>

                {/* Opción Estricta */}
                <div
                  onClick={() => esAdmin && setModoEstricto(true)}
                  class={`p-3 rounded-lg border cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                    modoEstricto
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div class="flex items-center gap-2.5">
                    <Icon name="shield" size={20} class={modoEstricto ? 'text-blue-700' : 'text-slate-400'} />
                    <div>
                      <span class="text-xs font-bold text-slate-900 block">Modo Estricto (Normativo BCN)</span>
                      <span class="text-[11px] text-slate-500">Tope legal de usura estricto (3.00%) y bloqueos duros</span>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="modo"
                    checked={modoEstricto}
                    disabled={!esAdmin}
                    onChange={() => setModoEstricto(true)}
                    class="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* 2. TASAS Y USURA */}
            <div class="bg-white rounded-lg border border-slate-200 p-4">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
                <Icon name="payments" size={18} class="text-emerald-600" />
                Tasas de Interés y Tope Legal de Usura
              </h3>

              <div class="space-y-3">
                {/* Checkbox usura */}
                <label class={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${
                  permitirSuperarUsura ? 'bg-amber-50/50 border-amber-300' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span class="text-xs font-semibold text-slate-800 flex items-center gap-2">
                    <Icon name={permitirSuperarUsura ? 'check_circle' : 'shield'} size={16} class={permitirSuperarUsura ? 'text-amber-600' : 'text-slate-400'} />
                    Permitir tasas superiores al tope de usura (Créditos Históricos)
                  </span>
                  <input
                    type="checkbox"
                    checked={permitirSuperarUsura}
                    disabled={!esAdmin}
                    onChange={(e) => setPermitirSuperarUsura((e.target as HTMLInputElement).checked)}
                    class="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300"
                  />
                </label>

                {/* Inputs de tasa en 2 columnas */}
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-xs font-semibold text-slate-700">Tasa Máxima Legal Referencial (BCN)</label>
                      <span class="text-[11px] font-bold text-blue-700 font-mono">{tasaLegalPorc}% m.</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        value={tasaMaximaLegal}
                        disabled={!esAdmin}
                        onChange={(e) => setTasaMaximaLegal((e.target as HTMLInputElement).value)}
                        class="flex-1 h-9 px-3 border rounded-md text-xs font-mono font-bold border-slate-300 text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        disabled={!esAdmin}
                        onClick={() => setTasaMaximaLegal('0.0300')}
                        class="h-9 px-2.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                      >
                        3% BCN
                      </button>
                      <button
                        type="button"
                        disabled={!esAdmin}
                        onClick={() => setTasaMaximaLegal('0.1000')}
                        class="h-9 px-2.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                      >
                        10%
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-xs font-semibold text-slate-700">Tasa de Mora Diaria Supletoria</label>
                      <span class="text-[11px] font-bold text-rose-700 font-mono">{tasaMoraPorc}% d.</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        value={tasaMoraDiaria}
                        disabled={!esAdmin}
                        onChange={(e) => setTasaMoraDiaria((e.target as HTMLInputElement).value)}
                        class="flex-1 h-9 px-3 border rounded-md text-xs font-mono font-bold border-slate-300 text-slate-900 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600"
                      />
                      <button
                        type="button"
                        disabled={!esAdmin}
                        onClick={() => setTasaMoraDiaria('0.0025')}
                        class="h-9 px-2.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                      >
                        0.25%
                      </button>
                      <button
                        type="button"
                        disabled={!esAdmin}
                        onClick={() => setTasaMoraDiaria('0.0050')}
                        class="h-9 px-2.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                      >
                        0.50%
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. DÍAS DE GRACIA */}
            <div class="bg-white rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-2.5">
                <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon name="schedule" size={18} class="text-amber-600" />
                  Días de Gracia de Cobranza
                </h3>
                <span class="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {diasGracia} días configurados
                </span>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                {[3, 4, 5, 7, 10].map((dias) => (
                  <button
                    key={dias}
                    type="button"
                    disabled={!esAdmin}
                    onClick={() => setDiasGracia(dias)}
                    class={`h-8 px-3 rounded-md text-xs font-bold transition-colors ${
                      diasGracia === dias
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {dias} Días {dias === 4 ? '(Estándar)' : ''}
                  </button>
                ))}

                <div class="flex items-center gap-1.5 ml-auto">
                  <span class="text-[11px] text-slate-500">Personalizado:</span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={diasGracia}
                    disabled={!esAdmin}
                    onChange={(e) => setDiasGracia(Number((e.target as HTMLInputElement).value))}
                    class="w-16 h-8 px-2 border rounded-md text-xs font-bold text-center border-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* 4. PERIODO INDEFINIDO */}
            <div class="bg-white rounded-lg border border-slate-200 p-4">
              <div class="flex items-center justify-between mb-2">
                <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Icon name="paid" size={18} class="text-emerald-600" />
                  Préstamos de Periodo Indefinido (Cuota Abierta)
                </h3>
                <span class={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  permitirPlazoIndefinido ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'
                }`}>
                  {permitirPlazoIndefinido ? 'Habilitado' : 'Deshabilitado'}
                </span>
              </div>

              <label class={`flex items-center justify-between p-3 rounded-lg border cursor-pointer ${
                permitirPlazoIndefinido ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span class="text-xs font-semibold text-slate-900 block">
                    Habilitar préstamos con plazo indefinido (Plazo = 0)
                  </span>
                  <span class="text-[11px] text-slate-500">
                    Cuota mensual requerida es el 100% de interés sobre saldo; pagos extra amortizan capital.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={permitirPlazoIndefinido}
                  disabled={!esAdmin}
                  onChange={(e) => setPermitirPlazoIndefinido((e.target as HTMLInputElement).checked)}
                  class="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
              </label>
            </div>

            {/* FOOTER ACCIONES */}
            {esAdmin && (
              <div class="flex items-center justify-between pt-2">
                <span class="text-[11px] text-slate-400">
                  {actualizadoEn ? `Actualizado: ${new Date(actualizadoEn).toLocaleDateString('es-NI')}` : ''}
                </span>

                <div class="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={cargarConfiguracion}
                    disabled={saving}
                    icon="sync"
                  >
                    Restablecer
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    icon={saving ? undefined : 'check_circle'}
                  >
                    {saving ? 'Guardando...' : 'Guardar Configuración'}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}
    </Layout>
  );
}
