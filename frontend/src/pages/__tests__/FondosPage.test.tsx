import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/api', () => ({
  fondoService: {
    list: vi.fn(),
    create: vi.fn(),
    inyeccion: vi.fn(),
    retiro: vi.fn(),
    movimientos: vi.fn(),
  },
}));

vi.mock('../../components/Layout', () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

import { fondoService } from '../../services/api';
import { ToastProvider } from '../../components/ui';
import { FondosPage } from '../FondosPage';

const FONDOS = [
  {
    id: 1,
    nombre: 'Fondo A',
    familiar: 'Familia Uno',
    saldo_disponible: '50000.00',
    capital_inicial: '50000.00',
    ganancias_acumuladas: '2500.00',
    capital_colocado: 30000,
    rentabilidad: 5,
    activo: true,
  },
  {
    id: 2,
    nombre: 'Fondo B',
    familiar: 'Familia Dos',
    saldo_disponible: '30000.00',
    capital_inicial: '30000.00',
    ganancias_acumuladas: '0.00',
    capital_colocado: 0,
    rentabilidad: 0,
    activo: true,
  },
];

const MOVIMIENTOS = [
  { id: 1, tipo: 'INYECCION', tipo_display: 'Inyección', monto: '50000.00', saldo_anterior: '0.00', saldo_posterior: '50000.00', descripcion: 'Capital inicial del fondo', creado_en: '2026-09-23T10:00:00-06:00' },
  { id: 2, tipo: 'RETIRO', tipo_display: 'Retiro', monto: '5000.00', saldo_anterior: '50000.00', saldo_posterior: '45000.00', descripcion: 'Retiro de capital', creado_en: '2026-09-24T10:00:00-06:00' },
];

/** El shell real envuelve las paginas en ToastProvider (ver app.tsx). */
function renderPagina() {
  return render(
    <ToastProvider>
      <FondosPage />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FondosPage (Bolsas de Capital)', () => {
  it('muestra resumen general con Dinero Disponible, Capital Regado y Capital Total', async () => {
    (fondoService.list as any).mockResolvedValue({ results: FONDOS });
    renderPagina();

    await waitFor(() => {
      // Métricas globales
      expect(screen.getByText('Dinero Disponible')).toBeInTheDocument();
      expect(screen.getByText('Capital Regado')).toBeInTheDocument();
      expect(screen.getByText('Capital Total')).toBeInTheDocument();

      // Verifica eliminación de rentabilidad y ganancias
      expect(screen.queryByText(/Rentabilidad/i)).toBeNull();
      expect(screen.queryByText(/Ganancias acumuladas/i)).toBeNull();
    });

    // Fichas individuales de bolsas
    expect(screen.getByText('Fondo A')).toBeInTheDocument();
    expect(screen.getByText('Fondo B')).toBeInTheDocument();
    expect(screen.getAllByText(/C\$50,000\.00/).length).toBeGreaterThan(0);
    expect(fondoService.list).toHaveBeenCalled();
  });

  it('muestra mensaje vacío cuando no hay fondos', async () => {
    (fondoService.list as any).mockResolvedValue({ results: [] });
    renderPagina();

    await waitFor(() => {
      expect(screen.getByText('No se encontraron fondos')).toBeInTheDocument();
    });
  });

  it('abre el modal de inyección y envía el monto', async () => {
    (fondoService.list as any).mockResolvedValue({ results: FONDOS });
    (fondoService.inyeccion as any).mockResolvedValue({ ...FONDOS[0], saldo_disponible: '60000.00' });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    fireEvent.click(screen.getAllByText('Inyección')[0]);
    const input = (await screen.findByLabelText(/Monto/)) as HTMLInputElement;
    fireEvent.input(input, { target: { value: '10000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inyectar' }));

    await waitFor(() => {
      expect(fondoService.inyeccion).toHaveBeenCalledWith(1, expect.objectContaining({ monto: '10000.00' }));
    });
  });

  it('muestra error de saldo insuficiente devuelto por el backend', async () => {
    (fondoService.list as any).mockResolvedValue({ results: [FONDOS[0]] });
    (fondoService.retiro as any).mockRejectedValue({
      response: { data: { error: 'Saldo insuficiente. Disponible: 50000.00, Solicitado: 100000.00' } },
    });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Retiro' }));
    const input = (await screen.findByLabelText(/Monto/)) as HTMLInputElement;
    fireEvent.input(input, { target: { value: '100000.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));

    await waitFor(() => {
      expect(screen.getByText(/Saldo insuficiente/)).toBeInTheDocument();
    });
  });

  it('lista los movimientos de un fondo', async () => {
    (fondoService.list as any).mockResolvedValue({ results: [FONDOS[0]] });
    (fondoService.movimientos as any).mockResolvedValue({ count: 2, results: MOVIMIENTOS });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Movimientos' }));

    await waitFor(() => {
      expect(fondoService.movimientos).toHaveBeenCalledWith(1, { page: 1 });
      expect(screen.getByText('Capital inicial del fondo')).toBeInTheDocument();
      expect(screen.getByText('Retiro de capital')).toBeInTheDocument();
    });
  });

  it('permite alternar la privacidad de saldos y expandir los detalles de la bolsa', async () => {
    (fondoService.list as any).mockResolvedValue({ results: FONDOS });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    // Botón para ocultar saldos
    const btnOcultar = screen.getByRole('button', { name: /Ocultar Saldos/i });
    fireEvent.click(btnOcultar);

    await waitFor(() => {
      expect(screen.getAllByText('C$ ••••••').length).toBeGreaterThan(0);
    });

    // Botón para expandir detalles
    const btnVerMas = screen.getAllByRole('button', { name: /Ver más información y rendimiento/i })[0];
    fireEvent.click(btnVerMas);

    await waitFor(() => {
      expect(screen.getByText('Rendimiento Acumulado')).toBeInTheDocument();
      expect(screen.getByText('5%')).toBeInTheDocument();
    });
  });

  it('permite crear una bolsa con datos legales de Persona Natural', async () => {
    (fondoService.list as any).mockResolvedValue({ results: FONDOS });
    (fondoService.create as any).mockResolvedValue({
      id: 3,
      nombre: 'Fondo San Juan',
      familiar: 'Roberto Morales',
      tipo_persona: 'NATURAL',
      capital_inicial: '40000.00',
    });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    // Abrir modal de creación con el botón "Nuevo Fondo"
    const btnCrear = screen.getByRole('button', { name: /Nuevo Fondo/i });
    fireEvent.click(btnCrear);

    await waitFor(() => {
      expect(screen.getByText('Tipo de Persona Titular / Aportante de la Bolsa')).toBeInTheDocument();
    });

    // Llenar campos
    fireEvent.input(screen.getByLabelText(/Nombre Descriptivo de la Bolsa/i), {
      target: { value: 'Fondo San Juan' },
    });
    fireEvent.input(screen.getByLabelText(/Capital Inicial/i), {
      target: { value: '40000.00' },
    });
    fireEvent.input(screen.getByLabelText(/Cédula de Identidad/i), {
      target: { value: '001-150490-0001A' },
    });
    fireEvent.input(screen.getByLabelText(/Nombres del Titular/i), {
      target: { value: 'Roberto' },
    });
    fireEvent.input(screen.getByLabelText(/Apellidos del Titular/i), {
      target: { value: 'Morales' },
    });

    // Enviar formulario
    const btnSubmit = screen.getAllByRole('button', { name: 'Crear Bolsa' }).find((b) => b.getAttribute('type') === 'submit');
    expect(btnSubmit).toBeDefined();
    fireEvent.click(btnSubmit!);

    await waitFor(() => {
      expect(fondoService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Fondo San Juan',
          tipo_persona: 'NATURAL',
          identificacion: '001-150490-0001A',
          nombres_titular: 'Roberto',
          apellidos_titular: 'Morales',
          familiar: 'Roberto Morales',
        })
      );
    });
  });

  it('permite cambiar a Persona Jurídica y registrar la bolsa con RUC y Representante Legal', async () => {
    (fondoService.list as any).mockResolvedValue({ results: FONDOS });
    (fondoService.create as any).mockResolvedValue({
      id: 4,
      nombre: 'Bolsa Mercantil S.A.',
      familiar: 'Inversiones del Valle S.A.',
      tipo_persona: 'JURIDICA',
      capital_inicial: '100000.00',
    });
    renderPagina();
    await waitFor(() => expect(screen.getByText('Fondo A')).toBeInTheDocument());

    // Abrir modal de creación con el botón "Nuevo Fondo"
    const btnCrear = screen.getByRole('button', { name: /Nuevo Fondo/i });
    fireEvent.click(btnCrear);

    await waitFor(() => {
      expect(screen.getByText('Tipo de Persona Titular / Aportante de la Bolsa')).toBeInTheDocument();
    });

    // Alternar a Persona Jurídica
    const btnJuridica = screen.getByRole('button', { name: /Persona Jurídica/i });
    fireEvent.click(btnJuridica);

    // Llenar campos de Persona Jurídica
    fireEvent.input(screen.getByLabelText(/Nombre Descriptivo de la Bolsa/i), {
      target: { value: 'Bolsa Mercantil S.A.' },
    });
    fireEvent.input(screen.getByLabelText(/Capital Inicial/i), {
      target: { value: '100000.00' },
    });
    fireEvent.input(screen.getByLabelText(/Razón Social/i), {
      target: { value: 'Inversiones del Valle S.A.' },
    });
    fireEvent.input(screen.getByLabelText(/Número RUC/i), {
      target: { value: 'J0310000123456' },
    });
    fireEvent.input(screen.getByLabelText(/Nombre del Representante Legal/i), {
      target: { value: 'Lic. Armando Vega' },
    });

    // Enviar formulario
    const btnSubmit = screen.getAllByRole('button', { name: 'Crear Bolsa' }).find((b) => b.getAttribute('type') === 'submit');
    expect(btnSubmit).toBeDefined();
    fireEvent.click(btnSubmit!);

    await waitFor(() => {
      expect(fondoService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          nombre: 'Bolsa Mercantil S.A.',
          tipo_persona: 'JURIDICA',
          razon_social: 'Inversiones del Valle S.A.',
          ruc: 'J0310000123456',
          representante_legal: 'Lic. Armando Vega',
          familiar: 'Inversiones del Valle S.A.',
        })
      );
    });
  });
});

