import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/api', () => ({
  prestamoService: {
    pagarPagare: vi.fn(),
    abrirPagareHtml: vi.fn(),
  },
}));

import { prestamoService } from '../../services/api';
import { BotonPagare } from '../BotonPagare';

const PDF = { blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), nombre: 'Pagare-001.pdf', variante: 'PDF/A-2b' };

let clickEnAncla: ReturnType<typeof vi.fn>;
let revocar: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  clickEnAncla = vi.fn();
  revocar = vi.fn();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pagare');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revocar as any);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickEnAncla as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BotonPagare', () => {
  it('descarga el PDF con el nombre que impone el servidor', async () => {
    (prestamoService.pagarPagare as any).mockResolvedValue(PDF);
    render(<BotonPagare prestamoId={7} />);

    fireEvent.click(screen.getByTestId('pagare-7'));

    await waitFor(() => expect(prestamoService.pagarPagare).toHaveBeenCalledWith(7));
    expect(clickEnAncla).toHaveBeenCalled();
    // El enlace temporal se retira del DOM y el blob se libera.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
    expect(revocar).toHaveBeenCalledWith('blob:pagare');
  });

  it('muestra el estado de carga mientras genera', async () => {
    let resolver: (valor: typeof PDF) => void = () => {};
    (prestamoService.pagarPagare as any).mockReturnValue(
      new Promise((r) => {
        resolver = r;
      })
    );
    render(<BotonPagare prestamoId={7} />);

    fireEvent.click(screen.getByTestId('pagare-7'));
    await waitFor(() => expect(screen.getByText('Generando')).toBeInTheDocument());

    resolver(PDF);
    await waitFor(() => expect(screen.getByText('Pagaré')).toBeInTheDocument());
  });

  it('cae al HTML imprimible si el servidor no tiene motor PDF', async () => {
    (prestamoService.pagarPagare as any).mockRejectedValue(new Error('503'));
    const escribir = vi.fn();
    const ventana = { document: { write: escribir, close: vi.fn() }, focus: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    (prestamoService.abrirPagareHtml as any).mockResolvedValue('<html>PAGARÉ</html>');

    render(<BotonPagare prestamoId={7} />);
    fireEvent.click(screen.getByTestId('pagare-7'));

    await waitFor(() => expect(prestamoService.abrirPagareHtml).toHaveBeenCalledWith(7));
    expect(escribir).toHaveBeenCalledWith('<html>PAGARÉ</html>');
    expect(ventana.focus).toHaveBeenCalled();
    expect(clickEnAncla).not.toHaveBeenCalled();
  });

  it('avisa cuando el navegador bloquea la ventana del pagaré', async () => {
    (prestamoService.pagarPagare as any).mockRejectedValue(new Error('503'));
    vi.spyOn(window, 'open').mockReturnValue(null);
    (prestamoService.abrirPagareHtml as any).mockResolvedValue('<html></html>');
    const onError = vi.fn();

    render(<BotonPagare prestamoId={7} onError={onError} />);
    fireEvent.click(screen.getByTestId('pagare-7'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('bloqueó')));
  });

  it('informa el fallo total cuando no hay PDF ni HTML', async () => {
    (prestamoService.pagarPagare as any).mockRejectedValue(new Error('500'));
    (prestamoService.abrirPagareHtml as any).mockRejectedValue(new Error('500'));
    const onError = vi.fn();

    render(<BotonPagare prestamoId={7} onError={onError} />);
    fireEvent.click(screen.getByTestId('pagare-7'));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('No se pudo generar'))
    );
  });

  it('abre directamente en ventana HTML formateada cuando abrirVentana es true', async () => {
    const escribir = vi.fn();
    const ventana = { document: { write: escribir, close: vi.fn() }, focus: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(ventana as unknown as Window);
    (prestamoService.abrirPagareHtml as any).mockResolvedValue('<html>PAGARÉ CON FORMATO OFICIAL</html>');

    render(<BotonPagare prestamoId={7} abrirVentana={true} />);
    fireEvent.click(screen.getByTestId('pagare-7'));

    await waitFor(() => expect(prestamoService.abrirPagareHtml).toHaveBeenCalledWith(7));
    expect(escribir).toHaveBeenCalledWith('<html>PAGARÉ CON FORMATO OFICIAL</html>');
    expect(ventana.focus).toHaveBeenCalled();
    expect(prestamoService.pagarPagare).not.toHaveBeenCalled();
  });
});
