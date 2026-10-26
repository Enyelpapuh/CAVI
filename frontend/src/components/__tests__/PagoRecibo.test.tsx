import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({
  pagoService: {
    getRecibo: vi.fn(),
    abrirReciboHtml: vi.fn(),
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PagoRecibo', () => {
  it('imprime el monto recibido en letras (Ley 842)', () => {
    expect(montoEnLetras(1845.98)).toBe(
      'Mil ochocientos cuarenta y cinco córdobas con noventa y ocho centavos (98/100)'
    );
    expect(montoEnLetras(0)).toBe('Cero córdobas con cero centavos (00/100)');
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

    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }));
    expect(printSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('abre el recibo oficial en nueva pestaña HTML al presionar Imprimir o Abrir en pestaña', async () => {
    const escribir = vi.fn();
    const ventana = {
      document: {
        write: escribir,
        close: vi.fn(),
        open: vi.fn(),
      },
      focus: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    (pagoService.abrirReciboHtml as any).mockResolvedValue('<html>RECIBO OFICIAL HTML</html>');

    render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByTitle(/Abrir recibo oficial en nueva pestaña/));

    await waitFor(() => expect(pagoService.abrirReciboHtml).toHaveBeenCalledWith(10));
    expect(escribir).toHaveBeenCalledWith('<html>RECIBO OFICIAL HTML</html>');
    expect(ventana.focus).toHaveBeenCalled();
  });

  it('permite visualizar un recibo cancelado con marca de agua INVÁLIDO y formato formal', async () => {
    const RECIBO_ANULADO = {
      ...RECIBO_ADMIN,
      estado: 'ANULADO',
      motivo_anulacion: 'Error de digitación en monto durante el arqueo de caja.',
      anulado_por_nombre: 'Supervisor Carlos',
      anulado_en: '2026-10-02T15:30:00Z',
    };
    (pagoService.getRecibo as any).mockResolvedValue(RECIBO_ANULADO);

    render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    // Debe mostrar la gran marca de agua de INVÁLIDO
    const marcaAgua = screen.getByTestId('marca-agua-invalido');
    expect(marcaAgua).toBeInTheDocument();
    expect(marcaAgua).toHaveTextContent(/ANULADO · INVÁLIDO/);
    expect(marcaAgua).toHaveTextContent(/OPERACIÓN REVERTIDA CONTABLEMENTE/);

    // Debe mostrar la causa de invalidación y el usuario que lo anuló
    expect(screen.getByText(/Error de digitación en monto durante el arqueo de caja/)).toBeInTheDocument();
    expect(screen.getByText(/Supervisor Carlos/)).toBeInTheDocument();

    // El estado legal debe indicar ANULADO · INVÁLIDO
    expect(screen.getAllByText(/ANULADO · INVÁLIDO/).length).toBeGreaterThan(0);

    // Debe tener habilitado el botón de imprimir comprobante anulado
    const btnImprimir = screen.getByRole('button', { name: /Imprimir Comprobante Anulado/ });
    expect(btnImprimir).toBeInTheDocument();

    const printSpy = vi.fn();
    vi.stubGlobal('print', printSpy);
    fireEvent.click(btnImprimir);
    expect(printSpy).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('aplica clases de aislamiento de impresión tipo pagaré', async () => {
    const { container } = render(<PagoRecibo pagoId={10} onClose={() => {}} />);
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));

    expect(container.querySelector('.comprobante-recibo-imprimible')).toBeInTheDocument();
    expect(container.querySelector('.comprobante-recibo-hoja')).toBeInTheDocument();
  });
});