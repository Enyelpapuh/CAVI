import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  prestamoService: {
    list: vi.fn(),
    pagar: vi.fn(),
    previewPago: vi.fn(),
    pagarPagare: vi.fn(),
    abrirPagareHtml: vi.fn(),
  },
  pagoService: {
    getRecibo: vi.fn(),
  },
  dashboardService: {
    resumen: vi.fn(),
    agenda: vi.fn(),
    caja: vi.fn(),
  },
}));

const useAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { prestamoService, pagoService, dashboardService } from '../../services/api';
import { CobrosPage } from '../CobrosPage';

const FILA = {
  id: 1,
  cliente: 1,
  cliente_nombre: 'Juan Perez',
  cliente_direccion: 'Barrio Centro',
  cliente_telefono: '81234567',
  estado: 'VIGENTE' as const,
  estado_efectivo: 'AL_DIA' as const,
  dias_atraso: 0,
  dias_gracia: 4,
  dias_mora: 0,
  interes_vencido: '0.00',
  mora_pendiente: '0.00',
  mora_acumulada: '0.00',
  tasa_mora: '0.0125',
  saldo_deudor: '8754.02',
  saldo_insoluto: '8454.02',
  cuota: '1845.98',
  cuota_fecha: '2026-10-31',
  cuota_periodo: 2,
  total_periodos: 6,
  bolsas: [],
};

const MORA = {
  ...FILA,
  id: 2,
  cliente_nombre: 'Maria Lopez',
  estado: 'EN_MORA' as const,
  estado_efectivo: 'EN_MORA' as const,
  dias_atraso: 9,
  dias_mora: 5,
  mora_pendiente: '62.50',
  mora_acumulada: '62.50',
  interes_vencido: '1250.00',
  saldo_deudor: '51250.00',
  cuota: '4874.36',
  cuota_periodo: 1,
};

const AGENDA = {
  resumen: {
    cantidad: 2,
    saldo_total: '60004.02',
    porcentaje_sano: '50.00',
    al_dia: 1,
    en_mora: 1,
    en_gracia: 0,
    saldo_en_mora: '51250.00',
    mora_total: '62.50',
    interes_vencido_total: '1250.00',
  },
  filas: [FILA, MORA],
};

const CAJA = {
  fecha: '2026-09-26',
  usuario: 'Cobrador Ruta 1',
  total_recaudado: '1845.98',
  recibos_emitidos: 1,
  por_metodo: { EFECTIVO: { label: 'Efectivo', monto: '1845.98' } },
  creditos_vigentes: 2,
};

const PREVIEW = {
  monto_recibido: '1845.98',
  monto_aplicado: '1845.98',
  exceso_no_aplicado: '0.00',
  minimo_ciclo: '253.62',
  capital_insoluto: '8454.02',
  interes_insoluto: '253.62',
  mora_insoluto: '0.00',
  deuda_total: '8707.64',
  aplicacion_mora: '0.00',
  aplicacion_interes: '253.62',
  aplicacion_capital: '1592.36',
  interes_administracion: '0.00',
  interes_fondos: '0.00',
  saldo_insoluto_tras_pago: '6861.66',
  deuda_tras_pago: '7114.28',
  deuda_liquidada: false,
  es_valido: true,
  error: null,
  detalle_mora: {
    aplica: false,
    dias_mora: 0,
    dias_nuevos: 0,
    mora_pendiente: '0.00',
    mora_acumulada: '0.00',
    mora_diaria: '0.00',
    mora_nueva: '0.00',
    saldo_base: '8454.02',
    tasa_mora_mensual: '0.0125',
    mora_acumulada_interes: false,
  },
};

const PAGO_CREADO = {
  id: 10,
  codigo_comprobante: 'PAG-00010',
  prestamo: 1,
  monto_total: '1845.98',
  aplicacion_interes: '253.62',
  aplicacion_capital: '1592.36',
  aplicacion_mora: '0.00',
  saldo_insoluto_tras_pago: '6861.66',
  exceso_no_aplicado: '0',
};

const RECIBO = {
  ...PAGO_CREADO,
  prestamo_cliente: 'Juan Perez',
  fecha_pago: '2026-10-01',
  metodo_pago: 'EFECTIVO',
  metodo_pago_display: 'Efectivo',
  referencia_bancaria: '',
  usuario_nombre: 'Cobrador Ruta 1',
  creado_en: '2026-10-01T12:00:00Z',
  fondos_detalle: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { rol: 'COBRANZA' } });
  (dashboardService.agenda as any).mockResolvedValue(AGENDA);
  (dashboardService.caja as any).mockResolvedValue(CAJA);
  (prestamoService.previewPago as any).mockResolvedValue(PREVIEW);
  (pagoService.getRecibo as any).mockResolvedValue(RECIBO);
});

describe('CobrosPage', () => {
  it('muestra la agenda con indicadores y creditos', async () => {
    render(<CobrosPage />);

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();
    expect(screen.getByText('C$60,004.02')).toBeInTheDocument();
    expect(screen.getAllByText('C$1,845.98').length).toBeGreaterThan(0);
    expect(dashboardService.agenda).toHaveBeenCalled();
    expect(dashboardService.caja).toHaveBeenCalled();
  });

  it('marca la mora e interes exigibles de cada credito', async () => {
    render(<CobrosPage />);

    await waitFor(() => screen.getByText('Maria Lopez'));
    expect(screen.getByText(/Mora C\$62\.50 · 5 dias/)).toBeInTheDocument();
    expect(screen.getByText(/Interes C\$1,250\.00/)).toBeInTheDocument();
    // El credito al dia no muestra insignias de mora.
    const tarjetaSana = screen.getByText('Juan Perez').closest('li');
    expect(tarjetaSana?.textContent).not.toContain('Mora C$');
  });

  it('muestra la ficha de pendientes del cliente al abrir el modal y no incluye boton de pagare en agenda', async () => {
    render(<CobrosPage />);

    await waitFor(() => screen.getByText('Juan Perez'));
    // El botón de pagaré ya no está presente en la agenda de cobranza
    expect(screen.queryByTestId('pagare-1')).toBeNull();
    expect(screen.queryByTestId('pagare-2')).toBeNull();

    // Abrir modal de abono
    fireEvent.click(screen.getByTestId('cobrar-1'));

    // Verifica que aparezca la ficha de pendientes del prestatario
    expect(screen.getByText('Cuota del Ciclo')).toBeInTheDocument();
    expect(screen.getByText('Deuda Total')).toBeInTheDocument();
    expect(screen.getByText('Período 2 de 6')).toBeInTheDocument();
    expect(screen.getByText('Mora Exigible')).toBeInTheDocument();
  });

  it('avisa la restriccion de privacidad al rol cobranza', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));
    expect(screen.getByText(/restringida por privacidad/i)).toBeInTheDocument();
  });

  it('filtra la agenda entre créditos en fecha y pasados', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    // Filtrar por Pasados
    fireEvent.click(screen.getByRole('button', { name: /Pasados/i }));
    await waitFor(() => expect(screen.queryByText('Juan Perez')).toBeNull());
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument();

    // Filtrar por En Fecha
    fireEvent.click(screen.getByRole('button', { name: /En Fecha/i }));
    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument());
    expect(screen.queryByText('Maria Lopez')).toBeNull();
  });

  it('consulta el preview de prelacion al escribir el monto', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByTestId('cobrar-1'));
    fireEvent.input(screen.getByLabelText(/Monto a cobrar/), { target: { value: '1845.98' } });

    await waitFor(() => {
      expect(prestamoService.previewPago).toHaveBeenCalledWith(1, '1845.98');
    });
    expect(await screen.findByText('Imputación Art. 3180')).toBeInTheDocument();
    expect(screen.getByText('C$253.62')).toBeInTheDocument();
    expect(screen.getByText('C$1,592.36')).toBeInTheDocument();
  });

  it('advierte que la mora se cobra antes que el interes', async () => {
    (prestamoService.previewPago as any).mockResolvedValue({
      ...PREVIEW,
      detalle_mora: { ...PREVIEW.detalle_mora, aplica: true, dias_mora: 5, mora_pendiente: '62.50' },
    });
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByTestId('cobrar-1'));
    fireEvent.input(screen.getByLabelText(/Monto a cobrar/), { target: { value: '1908.48' } });

    expect(
      await screen.findByText(/Mora de 5 dias fuera de gracia al 1\.25% mensual/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Se cobra antes que el interes/)).toBeInTheDocument();
  });

  it('bloquea el cobro si el monto es menor al interes del ciclo', async () => {
    (prestamoService.previewPago as any).mockResolvedValue({ ...PREVIEW, es_valido: false });
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByTestId('cobrar-1'));
    fireEvent.input(screen.getByLabelText(/Monto a cobrar/), { target: { value: '10.00' } });

    await waitFor(() => {
      expect(screen.getByText(/pago mínimo aceptado es el interés del ciclo/i)).toBeInTheDocument();
    });
    const confirmar = screen.getByRole('button', { name: 'Confirmar Cobro' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });

  it('registra el cobro y muestra el recibo', async () => {
    (prestamoService.pagar as any).mockResolvedValue(PAGO_CREADO);
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByTestId('cobrar-1'));
    fireEvent.input(screen.getByLabelText(/Monto a cobrar/), { target: { value: '1845.98' } });
    await waitFor(() => expect(screen.getByText('Imputación Art. 3180')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Cobro' }));

    await waitFor(() => {
      expect(prestamoService.pagar).toHaveBeenCalledWith(1, {
        monto: '1845.98',
        fecha_pago: expect.any(String),
        metodo_pago: 'EFECTIVO',
        referencia_bancaria: '',
      });
    });
    await waitFor(() => expect(screen.getAllByText(/PAG-00010/).length).toBeGreaterThan(0));
    expect(pagoService.getRecibo).toHaveBeenCalledWith(10);
  });

  it('exige la referencia bancaria en transferencias', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    fireEvent.click(screen.getByTestId('cobrar-1'));
    fireEvent.input(screen.getByLabelText(/Monto a cobrar/), { target: { value: '1845.98' } });
    fireEvent.change(screen.getByLabelText(/Metodo de pago/), { target: { value: 'TRANSFERENCIA' } });

    await waitFor(() => {
      expect(screen.getByText(/transferencias requieren referencia/i)).toBeInTheDocument();
    });
    const confirmar = screen.getByRole('button', { name: 'Confirmar Cobro' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.input(screen.getByLabelText(/Referencia bancaria/), { target: { value: 'REF-777' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Confirmar Cobro' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('mantiene la agenda como vista única y muestra los indicadores de en fecha y pasados', async () => {
    render(<CobrosPage />);
    await waitFor(() => screen.getByText('Juan Perez'));

    // Verifica que no existan pestañas de cambio de vista
    expect(screen.queryByRole('button', { name: /Mi Caja/i })).toBeNull();

    // Verifica los indicadores principales
    expect(screen.getByText('Cobros Hoy')).toBeInTheDocument();
    expect(screen.getByText('Por Cobrar')).toBeInTheDocument();
    expect(screen.getByText('En Fecha')).toBeInTheDocument();
    expect(screen.getByText('Pasados')).toBeInTheDocument();
  });
});
