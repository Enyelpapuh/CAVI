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
  it('carga y muestra los indicadores mensuales de intereses y capital reintegrado', async () => {
    render(<InformeBolsasPage />);

    await waitFor(() => {
      expect(screen.getByText('Informes Financieros de Bolsas')).toBeInTheDocument();
      expect(screen.getByText('Ingreso por Intereses')).toBeInTheDocument();
      expect(screen.getByText('Capital Reintegrado')).toBeInTheDocument();
      expect(screen.getByText('Total Recaudado en Mes')).toBeInTheDocument();
      expect(screen.getByText('Flujo Neto Mensual')).toBeInTheDocument();
    });

    // Desglose de cada fondo
    expect(screen.getByText('Fondo Principal')).toBeInTheDocument();
    expect(screen.getByText('Fondo Secundario')).toBeInTheDocument();

    // Transacciones del mes
    expect(screen.getByText('REC-2026-0010')).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });

  it('permite cambiar de mes y recargar el informe', async () => {
    render(<InformeBolsasPage />);

    await waitFor(() => expect(screen.getByText('Informes Financieros de Bolsas')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Mes Anterior/i }));

    await waitFor(() => {
      expect(fondoService.informeFinanciero).toHaveBeenCalled();
    });
  });
});
