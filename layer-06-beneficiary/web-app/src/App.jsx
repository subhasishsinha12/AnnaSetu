import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Vouchers from './pages/Vouchers';
import NearbyStores from './pages/NearbyStores';
import Onboarding from './pages/Onboarding';
import KiranaPOS from './pages/KiranaPOS';

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-amber-50 font-sans">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/vouchers" element={<Vouchers />} />
          <Route path="/stores" element={<NearbyStores />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/kirana" element={<KiranaPOS />} />
        </Routes>
      </div>
    </Router>
  );
}
