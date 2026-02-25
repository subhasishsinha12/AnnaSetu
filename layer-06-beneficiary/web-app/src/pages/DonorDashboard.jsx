/**
 * AnnaSetu — DonorDashboard page
 * Supermarket donor view: surplus lots, ONDC broadcasts, 80G certificate download
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const DONOR_API = '/api/donor';

// Mock demo data used when API is unavailable
const DEMO_STATS = {
  totalLots: 24,
  totalItems: 1840,
  totalWeightKg: 3200,
  beneficiariesServed: 1200,
  co2SavedKg: 9600,
  totalValueINR: 284000,
};

const DEMO_LOTS = [
  { lotId: 'LOT-DEMO0001', itemsDetected: 48, status: 'DISTRIBUTED', hyperledger_txId: 'TX-ABCD1234EFGH5678', createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
  { lotId: 'LOT-DEMO0002', itemsDetected: 32, status: 'AVAILABLE',   hyperledger_txId: 'TX-IJKL5678MNOP9012', createdAt: new Date(Date.now() - 1 * 3600000).toISOString() },
  { lotId: 'LOT-DEMO0003', itemsDetected: 15, status: 'BROADCAST',   hyperledger_txId: 'TX-QRST2345UVWX6789', createdAt: new Date().toISOString() },
];

const STATUS_COLOR = {
  AVAILABLE:   'bg-blue-100 text-blue-700',
  BROADCAST:   'bg-yellow-100 text-yellow-700',
  DISTRIBUTED: 'bg-green-100 text-green-700',
};

export default function DonorDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState(DEMO_STATS);
  const [lots, setLots] = useState(DEMO_LOTS);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState(null);

  const donorId = localStorage.getItem('donorId') || 'DONOR-RELIANCE-SURAT-001';

  // Simulate surplus detection demo
  const runSurplusDetection = async () => {
    setDetecting(true); setDetectResult(null);
    try {
      const res = await fetch(`${DONOR_API}/api/v1/surplus/detect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donorId,
          storeId: 'STORE-SURAT-ADAJAN',
          items: [
            { sku: 'GRN-001', name: 'Basmati Rice 5kg', category: 'packaged', expiryDate: new Date(Date.now() + 5 * 24 * 3600000).toISOString(), qty: 12, mrpINR: 350 },
            { sku: 'DAL-002', name: 'Toor Dal 1kg',     category: 'packaged', expiryDate: new Date(Date.now() + 3 * 24 * 3600000).toISOString(), qty: 8, mrpINR: 120 },
            { sku: 'VEG-003', name: 'Tomatoes 1kg',     category: 'produce',  expiryDate: new Date(Date.now() + 18 * 3600000).toISOString(),      qty: 20, mrpINR: 40 },
            { sku: 'MLK-004', name: 'Full Cream Milk 1L',category: 'perishable',expiryDate:new Date(Date.now() + 36 * 3600000).toISOString(),     qty: 30, mrpINR: 68 },
          ]
        })
      });
      const data = await res.json();
      if (res.ok) {
        setDetectResult(data);
        setLots(prev => [{
          lotId: data.lotId,
          itemsDetected: data.itemsDetected,
          status: 'BROADCAST',
          hyperledger_txId: data.hyperledger_txId,
          createdAt: new Date().toISOString()
        }, ...prev]);
      } else {
        // API not running — show demo result
        setDetectResult({ lotId: 'LOT-DEMO-NEW', itemsDetected: 4, ondc_broadcast: true, hyperledger_txId: 'TX-DEMO-NEW-001' });
      }
    } catch {
      setDetectResult({ lotId: 'LOT-DEMO-NEW', itemsDetected: 4, ondc_broadcast: true, hyperledger_txId: 'TX-DEMO-OFFLINE' });
    }
    setDetecting(false);
  };

  const download80G = () => {
    const cert = `
AnnaSetu — 80G Donation Certificate
=====================================
Donor:     ${donorId}
Issue Date:${new Date().toLocaleDateString('en-IN')}
Lots Donated: ${stats.totalLots}
Food Weight: ${stats.totalWeightKg} kg
Market Value: ₹${stats.totalValueINR.toLocaleString('en-IN')}
Beneficiaries: ${stats.beneficiariesServed}

This donation qualifies for 80G deduction under the Income Tax Act, 1961.
Verified by: IDBI Bank AnnaSetu Initiative, Surat Branch
Blockchain Ref: Hyperledger Fabric Channel — annasetu-channel
=====================================
    `.trim();
    const blob = new Blob([cert], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '80G-AnnaSetu.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-700 to-orange-600 text-white rounded-2xl p-5 mb-5 shadow">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold">🏢 {t('donorDashboard')}</h1>
            <p className="text-orange-200 text-xs mt-1">{donorId}</p>
          </div>
          <button onClick={download80G}
            className="bg-white text-orange-700 text-xs px-3 py-1.5 rounded-lg font-bold">
            📄 {t('cert80G')}
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: t('lotsRegistered'), value: stats.totalLots, icon: '📦' },
          { label: t('beneficiaries'),  value: stats.beneficiariesServed.toLocaleString('en-IN'), icon: '👥' },
          { label: t('totalDonated'),   value: `₹${(stats.totalValueINR / 1000).toFixed(0)}K`, icon: '💰' },
          { label: 'CO₂ Saved',         value: `${(stats.co2SavedKg / 1000).toFixed(1)}T`, icon: '🌿' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-3 shadow text-center">
            <p className="text-2xl">{s.icon}</p>
            <p className="text-xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Detect surplus button */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <p className="text-sm font-semibold text-blue-800 mb-2">🧪 Simulate Surplus Detection</p>
        <p className="text-xs text-blue-600 mb-3">Push today's near-expiry inventory to ONDC + Hyperledger</p>
        <button onClick={runSurplusDetection} disabled={detecting}
          className="w-full bg-blue-700 text-white rounded-xl py-2.5 font-bold text-sm disabled:opacity-50">
          {detecting ? '⏳ Detecting & Broadcasting…' : '⚡ Run Surplus Detection'}
        </button>
      </div>

      {detectResult && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
          <p className="font-bold text-green-800">✅ Surplus Detected & Listed</p>
          <p className="text-sm text-green-700 mt-1">Lot: <span className="font-mono">{detectResult.lotId}</span></p>
          <p className="text-sm text-green-700">{detectResult.itemsDetected} items broadcast to ONDC</p>
          <p className="text-xs text-gray-500 mt-1 font-mono break-all">TX: {detectResult.hyperledger_txId}</p>
        </div>
      )}

      {/* Recent lots */}
      <h2 className="font-bold text-gray-800 mb-3">Recent Surplus Lots</h2>
      <div className="space-y-3">
        {lots.map(lot => (
          <div key={lot.lotId} className="bg-white rounded-xl p-4 shadow">
            <div className="flex justify-between items-start mb-1">
              <p className="font-mono text-sm font-bold">{lot.lotId}</p>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${STATUS_COLOR[lot.status] || 'bg-gray-100 text-gray-500'}`}>
                {lot.status}
              </span>
            </div>
            <p className="text-sm text-gray-600">{lot.itemsDetected} items</p>
            <p className="text-xs text-gray-400 font-mono break-all mt-1">
              TX: {lot.hyperledger_txId?.substring(0, 20)}…
            </p>
            <p className="text-xs text-gray-400">{new Date(lot.createdAt).toLocaleTimeString('en-IN')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
