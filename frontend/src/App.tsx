import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteAnalytics } from './components/RouteAnalytics';
import { BlobBackground } from './components/ui/BlobBackground';
import { SiteFooter } from './components/SiteFooter';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Plans from './pages/Plans';
import Beta from './pages/Beta';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import ProcessEditor from './pages/ProcessEditor';
import CheckoutSuccess from './pages/CheckoutSuccess';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Refunds from './pages/legal/Refunds';
import Cookies from './pages/legal/Cookies';
import DataDeletion from './pages/legal/DataDeletion';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-2xl focus-visible:bg-white focus-visible:px-4 focus-visible:py-2.5 focus-visible:text-sm focus-visible:font-bold focus-visible:text-ink focus-visible:shadow-lift focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lavender/60"
        >
          Skip to main content
        </a>
        <RouteAnalytics />
        <BlobBackground />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/beta" element={<Beta />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/refunds" element={<Refunds />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/data-deletion" element={<DataDeletion />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/processes/new" element={<ProcessEditor />} />
            <Route path="/processes/:id" element={<ProcessEditor />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
          </Route>
        </Routes>
        <SiteFooter />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
