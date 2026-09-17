import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteAnalytics } from './components/RouteAnalytics';
import { BlobBackground } from './components/ui/BlobBackground';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Plans from './pages/Plans';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Connect from './pages/Connect';
import ProcessEditor from './pages/ProcessEditor';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RouteAnalytics />
        <BlobBackground />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/plans" element={<Plans />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/processes/new" element={<ProcessEditor />} />
            <Route path="/processes/:id" element={<ProcessEditor />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
