import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  fondoService: {
    list: vi.fn(),
    informeFinanciero: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { fondoService } from '../../services/api';
import { InformeBolsasPage } from '../InformeBolsasPage';

const FONDOS = [
  { id: 1, nombre: 'Fondo Principal', familiar: 'Fam Uno', saldo_disponible: '50000.00', activo: true },
  { id: 2, nombre: 'Fondo Secundario', familiar: 'Fam Dos', saldo_disponible: '30000.00', activo: true },
];

const INFORME_MOCK = {
  mes: 10,
  anio: 2026,
  resumen: {
    total_recaudado: '57150.00',
    capital_retornado: '42300.00',
    interes_total: '14850.00',
    interes_fondos: '7425.00',
    interes_admin: '7425.00',
    mora_total: '0.00',
    desembolsos_mes: '35000.00',
    flujo_neto: '22150.00',
    cantidad_pagos: 12,
  },
  comparativa_mes_anterior: {
    mes_anterior: 9,
    anio_anterior: 2026,
    total_recaudado: { actual: '57150.00', anterior: '50000.00', diferencia: '7150.00', porcentaje: '14.30' },
    capital_retornado: { actual: '42300.00', anterior: '38000.00', diferencia: '4300.00', porcentaje: '11.32' },
    interes_total: { actual: '14850.00', anterior: '12000.00', diferencia: '2850.00', porcentaje: '23.75' },
    interes_fondos: { actual: '7425.00', anterior: '6000.00', diferencia: '1425.00', porcentaje: '23.75' },
    interes_admin: { actual: '7425.00', anterior: '6000.00', diferencia: '1425.00', porcentaje: '23.75' },
    mora_total: { actual: '0.00', anterior: '0.00', diferencia: '0.00', porcentaje: '0.00' },
    desembolsos_mes: { actual: '35000.00', anterior: '40000.00', diferencia: '-5000.00', porcentaje: '-12.50' },
    cantidad_pagos: { actual: '12', anterior: '10', diferencia: '2', porcentaje: '20.00' },
  },
  seccion_cancelados: {
    cantidad: 1,
    total_revertido: '2500.00',
    capital_revertido: '2000.00',
    interes_revertido: '500.00',
    transacciones_canceladas: [
      {
        pago_id: 99,
        codigo_comprobante: 'REC-2026-0099',
        codigo_seguridad: '9A8B-7C6D',
        fecha_pago: '2026-10-02',
        fecha_anulacion: '2026-10-03',
        cliente: 'Carlos Morales',
        prestamo_id: 5,
        monto_total: '2500.00',
        aplicacion_capital: '2000.00',
        aplicacion_interes: '500.00',
        motivo_anulacion: 'Error de digitación en monto de caja durante el cobro',
        anulado_por_nombre: 'Admin General',
      },
    ],
  },
  desglose_fondos: [
    {
      fondo_id: 1,
      nombre: 'Fondo Principal',
      familiar: 'Fam Uno',
      saldo_actual: '50000.00',
      capital_reintegrado: '25380.00',
      ganancia_interes: '4455.00',
      total_acreditado: '29835.00',
      desembolsos_mes: '20000.00',
      flujo_neto: '9835.00',
      cantidad_abonos: 8,
    },
    {
      fondo_id: 2,
      nombre: 'Fondo Secundario',
      familiar: 'Fam Dos',
      saldo_actual: '30000.00',
      capital_reintegrado: '16920.00',
      ganancia_interes: '2970.00',
      total_acreditado: '19890.00',
      desembolsos_mes: '15000.00',
      flujo_neto: '4890.00',
      cantidad_abonos: 4,
    },
  ],
  transacciones: [
    {
      pago_id: 10,
      codigo_comprobante: 'REC-2026-0010',
      fecha_pago: '2026-10-05',
      cliente: 'Juan Perez',
      prestamo_id: 1,
      fondo_id: 1,
      fondo_nombre: 'Fondo Principal',
      porcentaje_pi: '0.6000',
      capital_reintegrado: '3000.00',
      ganancia_interes: '600.00',
      metodo_pago: 'Efectivo',
      referencia_bancaria: '',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  (fondoService.list as any).mockResolvedValue({ results: FONDOS });
  (fondoService.informeFinanciero as any).mockResolvedValue(INFORME_MOCK);
});

describe('InformeBolsasPage (Rendimiento Financiero de Bolsas)', () => {
  it('carga y muestra los indicadores mensuales y la comparativa MoM', async () => {
    render(<InformeBolsasPage />);

    await waitFor(() => {
      expect(screen.getByText('Informe Financiero Mensual')).toBeInTheDocument();
      expect(screen.getByText('Ingreso por Intereses')).toBeInTheDocument();
      expect(screen.getByText('Capital Reintegrado')).toBeInTheDocument();
      expect(screen.getByText('Total Recaudado en Mes')).toBeInTheDocument();
      expect(screen.getByText('Flujo Neto Mensual')).toBeInTheDocument();
    });

    // Comparativa MoM
    expect(screen.getByText(/Comparativa de Rendimiento con Mes Anterior/)).toBeInTheDocument();
    expect(screen.getByText('Recaudación Bruta en Caja')).toBeInTheDocument();
  });

  it('permite cambiar a la pestaña de cancelaciones y ver los comprobantes invalidados', async () => {
    render(<InformeBolsasPage />);

    await waitFor(() => expect(screen.getByText('Informe Financiero Mensual')).toBeInTheDocument());

    const btnTabCancelados = screen.getByRole('button', { name: /Operaciones Canceladas/ });
    fireEvent.click(btnTabCancelados);

    await waitFor(() => {
      expect(screen.getByText('Auditoría de Transacciones y Recibos Cancelados')).toBeInTheDocument();
      expect(screen.getByText('REC-2026-0099')).toBeInTheDocument();
      expect(screen.getByText(/Error de digitación en monto de caja durante el cobro/)).toBeInTheDocument();
      expect(screen.getByText('Carlos Morales')).toBeInTheDocument();
    });
  });

  it('permite cambiar de mes y recargar el informe', async () => {
    render(<InformeBolsasPage />);

    await waitFor(() => expect(screen.getByText('Informe Financiero Mensual')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Mes Anterior/i }));

    await waitFor(() => {
      expect(fondoService.informeFinanciero).toHaveBeenCalled();
    });
  });
});

