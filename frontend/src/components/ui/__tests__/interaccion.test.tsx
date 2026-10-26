import { useState } from 'preact/hooks';
import { render, screen, fireEvent, act } from '@testing-library/preact';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../Toast';
import { Modal } from '../Modal';
import { Input } from '../Field';

function Disparador() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.success('Pago registrado')}>
      Confirmar
    </button>
  );
}

describe('Toast', () => {
  it('muestra la notificación y permite descartarla', () => {
    render(
      <ToastProvider>
        <Disparador />
      </ToastProvider>
    );

    act(() => {
      fireEvent.click(screen.getByText('Confirmar'));
    });
    expect(screen.getByText('Pago registrado')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByLabelText('Cerrar notificación'));
    });
    expect(screen.queryByText('Pago registrado')).not.toBeInTheDocument();
  });
});

describe('Modal', () => {
  it('no renderiza nada cuando esta cerrado', () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Registrar Abono">
        Contenido
      </Modal>
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('expone dialogo modal y cierra con Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Registrar Abono" icon="paid">
        <p>Contenido</p>
      </Modal>
    );

    expect(screen.getByRole('dialog', { name: 'Registrar Abono' })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('no desenfoca los inputs al escribir dentro de un modal', () => {
    function ModalConForm() {
      const [nombre, setNombre] = useState('');
      return (
        <Modal open onClose={() => {}} title="Usuario">
          <Input label="Nombre Completo" value={nombre} onInput={setNombre} />
        </Modal>
      );
    }

    render(<ModalConForm />);
    const input = screen.getByLabelText('Nombre Completo') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.input(input, { target: { value: 'A' } });
    expect(input.value).toBe('A');
    expect(document.activeElement).toBe(input);
  });
});

describe('Input', () => {
  it('asocia etiqueta, prefijo de moneda y error al control', () => {
    const onInput = vi.fn();
    render(
      <Input
        label="Monto a ingresar"
        value=""
        onInput={onInput}
        prefix="C$"
        error="El monto es menor al mínimo legal"
        required
        data-testid="monto"
      />
    );

    const campo = screen.getByLabelText(/Monto a ingresar/);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('El monto es menor al mínimo legal')).toBeInTheDocument();
    expect(screen.getByText('C$')).toBeInTheDocument();

    fireEvent.input(campo, { target: { value: '1845.98' } });
    expect(onInput).toHaveBeenCalledWith('1845.98');
  });
});
