/**
 * AnnaSetu — Layer 06: Beneficiary Portal — App.jsx
 * React 18, react-router-dom v6, i18next, Tailwind CSS
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './i18n/i18n-setup';

// Lazy-loaded pages
const EligibilityCheck  = lazy(() => import('./pages/EligibilityCheck'));
const MyVouchers        = lazy(() => import('./pages/MyVouchers'));
const RedeemPage        = lazy(() => import('./pages/RedeemPage'));
const NearbyStores      = lazy(() => import('./pages/NearbyStores'));
const DonorDashboard    = lazy(() => import('./pages/DonorDashboard'));
const KiranaPOS         = lazy(() => import('../kirana-pos/src/KiranaPOS'));

// ── PWA Offline Banner ────────────────────────────────────────────────────────
function OfflineBanner() {
  const { t }      = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on  = () => setOffline(true);
    const off = () => setOffline(false);
    window.addEventListener('offline', on);
    window.addEventListener('online', off);
    return () => { window.removeEventListener('offline', on); window.removeEventListener('online', off); };
  }, []);
  if (!offline) return null;
  return (
    <div className="bg-yellow-500 text-black text-sm text-center py-2 px-4 flex items-center gap-2 justify-center">
      <span>📴</span> {t('offlineMode')}
    </div>
  );
}

// ── Language Switcher ─────────────────────────────────────────────────────────
function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const langs    = [{ code: 'en', label: 'EN' }, { code: 'hi', label: 'हि' }, { code: 'gu', label: 'ગુ' }];
  return (
    <div className="flex gap-1">
      {langs.map(l => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${i18n.language === l.code ? 'bg-white text-green-800' : 'text-white opacity-70 hover:opacity-100'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

// ── Bottom Navigation ─────────────────────────────────────────────────────────
function BottomNav({ role }) {
  const { t }    = useTranslation();
  const location = useLocation();
  const tabs = role === 'merchant' ? [
    { path: '/pos',    icon: '🔍', label: 'Scan' },
    { path: '/settle', icon: '💰', label: 'Settle' },
  ] : [
    { path: '/check',  icon: '✅', label: t('checkEligibility').split(' ')[0] },
    { path: '/vouchers',icon: '🎟️', label: t('myVouchers').split(' ')[0] },
    { path: '/stores', icon: '🏪', label: t('nearbyStores').split(' ')[0] },
    { path: '/scan',   icon: '📷', label: t('scanQR').split(' ')[1] },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-2 z-50 max-w-sm mx-auto">
      {tabs.map(tab => (
        <Link
          key={tab.path}
          to={tab.path}
          className={`flex flex-col items-center text-xs gap-0.5 px-3 transition-colors ${
            location.pathname === tab.path ? 'text-green-700 font-bold' : 'text-gray-500'
          }`}
        >
          <span className="text-xl">{tab.icon}</span>
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header() {
  const { t } = useTranslation();
  return (
    <header className="bg-gradient-to-r from-green-800 to-green-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌾</span>
        <div>
          <div className="font-bold text-lg leading-tight">{t('appName')}</div>
          <div className="text-xs opacity-75">{t('tagline')}</div>
        </div>
      </div>
      <LanguageSwitcher />
    </header>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [role, setRole] = useState(() => localStorage.getItem('annasetu_role') || 'beneficiary');

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 max-w-sm mx-auto relative">
        <OfflineBanner />
        <Header />
        <main className="pb-20 pt-2">
          <Suspense fallback={
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin text-4xl">🌾</div>
            </div>
          }>
            <Routes>
              <Route path="/"         element={<Navigate to="/check" replace />} />
              <Route path="/check"    element={<EligibilityCheck />} />
              <Route path="/vouchers" element={<MyVouchers />} />
              <Route path="/scan"     element={<RedeemPage />} />
              <Route path="/stores"   element={<NearbyStores />} />
              <Route path="/donor"    element={<DonorDashboard />} />
              <Route path="/pos"      element={<KiranaPOS />} />
            </Routes>
          </Suspense>
        </main>
        <BottomNav role={role} />
      </div>
    </BrowserRouter>
  );
}
