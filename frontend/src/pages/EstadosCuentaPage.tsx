import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui';

export function EstadosCuentaPage() {
  return (
    <Layout titulo="Estados de Cuenta">
      <PageHeader
        titulo="Estados de Cuenta"
        descripcion="Generación de extractos e historiales financieros de clientes."
      />
      <div class="mt-8">
        <EmptyState
          icon="receipt_long"
          title="Módulo en construcción"
          description="La generación avanzada de estados de cuenta estará disponible próximamente."
        />
      </div>
    </Layout>
  );
}
