import { useState } from 'preact/hooks';
import { Button } from './ui';
import type { ButtonVariant } from './ui/Button';
import { prestamoService } from '../services/api';

interface BotonPagareProps {
  /** Préstamo cuyo pagaré se descarga. */
  prestamoId: number;
  class?: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  abrirVentana?: boolean;
  onError?: (mensaje: string) => void;
}

/**
 * Descarga o previsualiza el pagaré legal del préstamo (CAVI-TK25).
 *
 * El backend responde PDF; si la máquina no tiene motor PDF configurado
 * devuelve 503 y aquí se degrada abriendo el pagaré HTML en una pestaña para
 * que el cobrador pueda imprimirlo igual. Así el documento nunca queda
 * bloqueado por una dependencia de sistema.
 */
export function BotonPagare({
  prestamoId,
  class: className,
  variant = 'secondary',
  size = 'md',
  label = 'Pagaré',
  abrirVentana = false,
  onError,
}: BotonPagareProps) {
  const [descargando, setDescargando] = useState(false);

  const imprimirHtml = async () => {
    const html = await prestamoService.abrirPagareHtml(prestamoId);
    const ventana = window.open('', '_blank');
    if (!ventana) {
      onError?.('El navegador bloqueó la ventana del pagaré: permite las ventanas emergentes.');
      return;
    }
    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
  };

  const descargar = async () => {
    setDescargando(true);
    try {
      const { blob, nombre } = await prestamoService.pagarPagare(prestamoId);
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Liberar el object URL de inmediato revoca el blob en algunos navegadores.
      URL.revokeObjectURL(url);
    } catch {
      try {
        await imprimirHtml();
      } catch {
        onError?.('No se pudo generar el pagaré. Intente de nuevo.');
      }
    } finally {
      setDescargando(false);
    }
  };

  const handleClick = async () => {
    if (abrirVentana) {
      setDescargando(true);
      try {
        await imprimirHtml();
      } catch {
        onError?.('No se pudo abrir el pagaré.');
      } finally {
        setDescargando(false);
      }
    } else {
      await descargar();
    }
  };

  return (
    <Button
      class={className}
      variant={variant}
      size={size}
      icon="description"
      loading={descargando}
      onClick={handleClick}
      data-testid={`pagare-${prestamoId}`}
    >
      {descargando ? 'Generando' : label}
    </Button>
  );
}
