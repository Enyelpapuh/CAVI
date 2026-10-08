import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui';

export function SettingsPage() {
  return (
    <Layout titulo="Configuración del Sistema">
      <PageHeader
        titulo="Configuración del Sistema"
        descripcion="Variables globales, integraciones y parámetros de negocio."
      />
      <div class="mt-8">
        <EmptyState
          icon="settings"
          title="Módulo en construcción"
          description="Los ajustes globales de la aplicación estarán disponibles próximamente."
        />
      </div>
    </Layout>
  );
}
