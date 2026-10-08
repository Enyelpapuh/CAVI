import { Layout } from '../components/Layout';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/ui';

export function PermisosPage() {
  return (
    <Layout titulo="Permisos y Roles">
      <PageHeader
        titulo="Permisos y Roles"
        descripcion="Configura las políticas de acceso y seguridad para cada rol del sistema."
      />
      <div class="mt-8">
        <EmptyState
          icon="shield"
          title="Módulo en construcción"
          description="La asignación granular de permisos estará disponible en las próximas iteraciones."
        />
      </div>
    </Layout>
  );
}
