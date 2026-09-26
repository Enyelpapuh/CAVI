import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  pagoService: {
    getRecibo: vi.fn(),
  },
}));

import { pagoService } from '../../services/api';
import { PagoRecibo, montoEnLetras } from '../PagoRecibo';

const RECIBO_ADMIN = {
  id: 10,
  codigo_comprobante: 'PAG-00010',
  prestamo: 1,
  prestamo_cliente: 'Juan Perez - 001-111222-3',
  prestamo_monto: '10000.00',
  monto_total: '1845.98',
  fecha_pago: '2026-10-01',
  metodo_pago: 'EFECTIVO',
  metodo_pago_display: 'Efectivo',
  referencia_bancaria: '',
  aplicacion_mora: '0.00',
  aplicacion_interes: '253.62',
  aplicacion_capital: '1592.36',
  interes_administracion: '126.81',
  interes_fondos: '126.81',
  saldo_insoluto_tras_pago: '6861.66',
  saldo_deudor_tras_pago: 7105.28,
  usuario_nombre: 'Admin CAVI',
  creado_en: '2026-10-01T12:00:00Z',
  fondos_detalle: [
    {
      id: 1,
      fondo: 1,
      fondo_nombre: 'Fondo Principal',
      fondo_familiar: 'Fam Uno',
      porcentaje_pi: '0.5000',
      capital_reintegrado: '796.18',
      ganancia: '63.41',
    },
    {
      id: 2,
      fondo: 2,
      fondo_nombre: 'Fondo Secundario',
      fondo_familiar: 'Fam Dos',
      porcentaje_pi: '0.5000',
      capital_reintegrado: '796.18',
      ganancia: '63.41',
    },
  ],
  ganancia_administracion: '126.81',
};

// Como lo devuelve el backend para rol COBRANZA (pops 50/50 + fondos)
const RECIBO_COBRANZA = {
  id: 10,
  codigo_comprobante: 'PAG-00010',
  prestamo: 1,
  prestamo_cliente: 'Juan Perez - 001-111222-3',
  prestamo_monto: '10000.00',
  monto_total: '1845.98',
  fecha_pago: '2026-10-01',
  metodo_pago: 'EFECTIVO',
  aplicacion_mora: '0.00',
  aplicacion_interes: '253.62',
  aplicacion_capital: '1592.36',
  saldo_insoluto_tras_pago: '6861.66',
  usuario_nombre: 'Maria Cobranza',
  creado_en: '2026-10-01T12:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  (pagoService.getRecibo as any).mockResolvedValue(RECIBO_ADMIN);
});

describe('PagoRecibo', () => {
  it('imprime el monto recibido en letras (Ley 842)', () => {
    expect(montoEnLetras(1845.98)).toBe(
      'Mil ochocientos cuarenta y cinco córdobas con 98/100'
    );
    expect(montoEnLetras(0)).toBe('Cero córdobas con 00/100');
  });

  it('muestra desglose completo y liquidación 50/50 para administración', async () => {
    render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    expect(screen.getByText('C$1,845.98')).toBeInTheDocument();
    expect(screen.getByText('C$1,592.36')).toBeInTheDocument();
    expect(screen.getByText('C$253.62')).toBeInTheDocument();
    expect(screen.getByText(/Interés de Administración \(50%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Interés de Fondos \(50%\)/)).toBeInTheDocument();
    expect(screen.getByText(/Reintegro a Fondos/)).toBeInTheDocument();
    expect(screen.getByText(/Fondo Principal \(Fam Uno\)/)).toBeInTheDocument();
  });

  it('oculta utilidades y fondos en recibo de COBRANZA (Ley 787)', async () => {
    (pagoService.getRecibo as any).mockResolvedValue(RECIBO_COBRANZA);
    render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    expect(screen.getByText('C$1,845.98')).toBeInTheDocument();
    expect(screen.queryByText(/Interés de Administración \(50%\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Interés de Fondos \(50%\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Reintegro a Fondos/)).not.toBeInTheDocument();
  });

  it('invoca la impresión al pulsar Imprimir / PDF', async () => {
    const printSpy = vi.fn();
    vi.stubGlobal('print', printSpy);
    render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /Imprimir \/ PDF/ }));
    expect(printSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});