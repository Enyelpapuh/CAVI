import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from '../StatusBadge';
import { Icon } from '../Icon';
import { KpiTile } from '../KpiTile';

describe('StatusBadge', () => {
  it('muestra Al Día con punto verde para un préstamo vigente sin atraso', () => {
    render(<StatusBadge estado="VIGENTE" diasAtraso={0} />);
    expect(screen.getByText('Al Día')).toBeInTheDocument();
  });

  it('muestra En Gracia dentro de los 4 dias y En Mora despues', () => {
    const { unmount } = render(<StatusBadge estado="VIGENTE" diasAtraso={4} />);
    expect(screen.getByText('En Gracia')).toBeInTheDocument();
    unmount();

    render(<StatusBadge estado="VIGENTE" diasAtraso={5} />);
    expect(screen.getByText('En Mora (5d)')).toBeInTheDocument();
  });

  it('muestra Liquidado para préstamos cancelados', () => {
    render(<StatusBadge estado="CANCELADO" />);
    expect(screen.getByText('Liquidado')).toBeInTheDocument();
  });
});

describe('Icon', () => {
  it('renderiza el nombre del icono como ligadura de Material Symbols', () => {
    const { container } = render(<Icon name="payments" />);
    const span = container.querySelector('.material-symbols-outlined');
    expect(span).toHaveTextContent('payments');
    expect(span).toHaveAttribute('aria-hidden', 'true');
  });

  it('expone el icono como imagen cuando lleva titulo', () => {
    render(<Icon name="verified" title="Verificado" />);
    expect(screen.getByRole('img', { name: 'Verificado' })).toBeInTheDocument();
  });
});

describe('KpiTile', () => {
  it('muestra etiqueta y monto con cifras tabulares', () => {
    render(<KpiTile label="Clientes Activos" value="94" icon="groups" />);
    expect(screen.getByText('Clientes Activos')).toBeInTheDocument();
    expect(screen.getByText('94').className).toContain('tnum');
  });
});
