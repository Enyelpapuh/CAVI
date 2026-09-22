import { Component } from 'preact';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  path: string;
  component: any;
  requireAuth: boolean;
  default?: boolean;
}

export class ProtectedRoute extends Component<ProtectedRouteProps> {
  render() {
    const { path, component: Component, requireAuth, default: isDefault } = this.props;
    const { isAuthenticated } = useAuth();

    if (requireAuth && !isAuthenticated) {
      return <Component path="/login" />;
    }

    if (!requireAuth && isAuthenticated) {
      return <Component path="/clientes" />;
    }

    return isDefault ? <Component path="/" /> : <Component path={path} />;
  }
}