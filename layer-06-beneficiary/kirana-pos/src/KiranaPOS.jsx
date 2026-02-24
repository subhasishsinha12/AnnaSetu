/**
 * AnnaSetu — Kirana POS with Camera QR Scanner
 * Uses @zxing/browser for real-time QR decoding
 * Merchants scan beneficiary vouchers to redeem
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserQRCodeReader, BrowserCodeReader } from '@zxing/browser';
import { useTranslation } from 'react-i18next';

const API_BASE = import.meta.env.VITE_ERUPI_API || 'http://localhost:3005';

// ── QR Scanner Component ──────────────────────────────────────────────────────
function QRScanner({ onResult, onError }) {
  const videoRef  = useRef(null);
  const readerRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [cameras,  setCameras]  = useState([]);
  const [activeCamera, setActiveCamera] = useState('');

  useEffect(() => {
    readerRef.current = new BrowserQRCodeReader();
    BrowserCodeReader.listVideoInputDevices().then(devices => {
      setCameras(devices);
      // Prefer rear camera
      const rear = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
      setActiveCamera(rear?.deviceId || devices[0]?.deviceId || '');
    });
    return () => readerRef.current?.reset();
  }, []);

  const startScan = useCallback(async () => {
    if (!videoRef.current || !activeCamera) return;
    setScanning(true);
    try {
      const result = await readerRef.current.decodeOnceFromVideoDevice(activeCamera, videoRef.current);
      setScanning(false);
      onResult(result.getText());
    } catch (err) {
      setScanning(false);
      if (err.name !== 'NotFoundException') onError?.(err.message);
    }
  }, [activeCamera, onResult, onError]);

  const stopScan = () => {
    readerRef.current?.reset();
    setScanning(false);
  };

  return (
    <div className="relative">
      {cameras.length > 1 && (
        <select
          value={activeCamera}
          onChange={e => setActiveCamera(e.target.value)}
          className="w-full mb-2 p-2 border rounded text-sm"
        >
          {cameras.map(c => <option key={c.deviceId} value={c.deviceId}>{c.label || 'Camera'}</option>)}
        </select>
      )}
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '1/1', maxWidth: 320, margin: '0 auto' }}>
        <video ref={videoRef} className="w-full h-full object-cover" />
        {/* Scanning overlay */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-4 border-green-400 w-48 h-48 rounded-lg animate-pulse opacity-75" />
            <div className="absolute border-t-4 border-green-400 w-48 top-1/2" style={{ animation: 'scan 2s linear infinite' }} />
          </div>
        )}
        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <button onClick={startScan} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold text-lg">
              📷 Start Scan
            </button>
          </div>
        )}
      </div>
      {scanning && (
        <button onClick={stopScan} className="w-full mt-2 bg-red-500 text-white py-2 rounded-lg font-bold">
          ⏹ Stop
        </button>
      )}
      <style>{`
        @keyframes scan { 0%{top:10%} 100%{top:90%} }
      `}</style>
    </div>
  );
}

// ── Voucher Card ──────────────────────────────────────────────────────────────
function VoucherCard({ voucher, onRedeem, loading }) {
  const statusColors = {
    ACTIVE:   'bg-green-100 text-green-800',
    REDEEMED: 'bg-gray-100 text-gray-600',
    EXPIRED:  'bg-red-100 text-red-700',
  };
  return (
    <div className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-xs text-gray-500">Voucher Ref</div>
          <div className="font-mono text-sm font-bold text-gray-800">{voucher.voucher_ref}</div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-bold ${statusColors[voucher.status] || 'bg-gray-100'}`}>
          {voucher.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-green-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Face Value</div>
          <div className="font-bold text-green-700 text-xl">₹{Number(voucher.face_value).toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">Expires</div>
          <div className="font-bold text-blue-700 text-sm">
            {new Date(voucher.expires_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 mb-3">
        <span className="font-medium">Merchant:</span> {voucher.merchant_name}
      </div>

      {voucher.status === 'ACTIVE' && onRedeem && (
        <button
          onClick={() => onRedeem(voucher)}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl transition-colors disabled:opacity-50"
        >
          {loading ? '⏳ Processing…' : '✅ Redeem Now'}
        </button>
      )}
    </div>
  );
}

// ── Settlement Panel ──────────────────────────────────────────────────────────
function SettlementPanel({ merchantId }) {
  const [report,   setReport]  = useState(null);
  const [settling, setSettling]= useState(false);
  const [error,    setError]   = useState('');

  const fetchReport = async () => {
    const r = await fetch(`${API_BASE}/api/erupi/settlements/report/${merchantId}`);
    const d = await r.json();
    setReport(d);
  };

  useEffect(() => { if (merchantId) fetchReport(); }, [merchantId]);

  const handleSettle = async () => {
    setSettling(true);
    try {
      const r = await fetch(`${API_BASE}/api/erupi/settlements/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      alert(`✅ Settled ₹${d.net_amount} | UTR: ${d.npci_settle?.utrNumber}`);
      fetchReport();
    } catch (e) {
      setError(e.message);
    } finally {
      setSettling(false);
    }
  };

  if (!report) return <div className="p-4 text-center text-gray-500">Loading…</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="font-bold text-lg text-green-800">💰 Settlement</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Total Redeemed</div>
          <div className="font-bold text-green-700 text-lg">{report.summary?.total_redeemed}</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-500">Total Settled</div>
          <div className="font-bold text-blue-700 text-lg">{report.summary?.total_settled}</div>
        </div>
      </div>
      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}
      <button
        onClick={handleSettle}
        disabled={settling}
        className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl"
      >
        {settling ? '⏳ Processing…' : '💳 Request Settlement'}
      </button>
      {report.batches?.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-gray-700 mb-2">Recent Batches</h3>
          {report.batches.map(b => (
            <div key={b.id} className="bg-gray-50 rounded-lg p-3 text-sm mb-2">
              <div className="flex justify-between">
                <span className="font-mono text-xs">{b.batch_ref}</span>
                <span className="font-bold text-green-700">₹{b.net_amount}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                UTR: {b.utr_number} | {new Date(b.settled_at).toLocaleDateString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Kirana POS ────────────────────────────────────────────────────────────
export default function KiranaPOS() {
  const { t }       = useTranslation();
  const [tab,       setTab]       = useState('scan');   // 'scan' | 'manual' | 'settle'
  const [voucher,   setVoucher]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [manualRef, setManualRef] = useState('');
  const [amount,    setAmount]    = useState('');

  const merchantId = localStorage.getItem('merchant_id') || 'KIRANA-DEMO-001';

  const fetchVoucher = async (ref) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/erupi/vouchers/${ref}`);
      if (!r.ok) throw new Error('Voucher not found');
      const d = await r.json();
      setVoucher(d);
      setAmount(String(d.face_value));
    } catch (e) {
      setError(e.message);
      setVoucher(null);
    } finally {
      setLoading(false);
    }
  };

  const handleQRResult = (text) => {
    // Extract voucher ref from QR string
    // QR format: ANNA-VCH-YYYYMMDD-XXXXXX or full UPI deep link
    const match = text.match(/ANNA-VCH-\d{8}-[A-F0-9]{6}/i);
    const ref   = match ? match[0] : text;
    fetchVoucher(ref);
  };

  const handleRedeem = async (v) => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/erupi/vouchers/redeem`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ voucher_ref: v.voucher_ref, merchant_id: merchantId, amount }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess(`✅ Redeemed ₹${d.amount} | UTR: ${d.utr}`);
      setVoucher(null);
      // Offline queue if request fails
    } catch (e) {
      if (!navigator.onLine) {
        queueOfflineRedemption(v.voucher_ref, amount);
        setSuccess('📴 Queued for offline sync');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const queueOfflineRedemption = (ref, amt) => {
    const q = JSON.parse(localStorage.getItem('annasetu_offline_queue') || '[]');
    q.push({ ref, amt, merchant_id: merchantId, ts: new Date().toISOString() });
    localStorage.setItem('annasetu_offline_queue', JSON.stringify(q));
  };

  // Sync offline queue when back online
  useEffect(() => {
    const syncQueue = async () => {
      const q = JSON.parse(localStorage.getItem('annasetu_offline_queue') || '[]');
      if (!q.length || !navigator.onLine) return;
      const remaining = [];
      for (const item of q) {
        try {
          await fetch(`${API_BASE}/api/erupi/vouchers/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voucher_ref: item.ref, merchant_id: item.merchant_id, amount: item.amt }),
          });
        } catch { remaining.push(item); }
      }
      localStorage.setItem('annasetu_offline_queue', JSON.stringify(remaining));
      if (remaining.length < q.length) alert(`✅ Synced ${q.length - remaining.length} offline redemptions`);
    };
    window.addEventListener('online', syncQueue);
    return () => window.removeEventListener('online', syncQueue);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white px-4 py-3">
        <div className="font-bold text-lg">🏪 Kirana POS — AnnaSetu</div>
        <div className="text-xs opacity-75">Merchant: {merchantId}</div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-white border-b">
        {[['scan','📷 Scan','scan'],['manual','⌨️ Manual','manual'],['settle','💰 Settle','settle']].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setError(''); setSuccess(''); setVoucher(null); }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === id ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Messages */}
        {error   && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg mb-4">⚠️ {error}</div>}
        {success && <div className="bg-green-50 text-green-700 text-sm p-3 rounded-lg mb-4">{success}</div>}

        {/* QR Scan tab */}
        {tab === 'scan' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-700">Scan Beneficiary QR</h2>
            <QRScanner
              onResult={handleQRResult}
              onError={e => setError(e)}
            />
            {loading && <div className="text-center py-4"><div className="animate-spin text-3xl inline-block">⏳</div></div>}
            {voucher && <VoucherCard voucher={voucher} onRedeem={handleRedeem} loading={loading} />}
            {voucher && voucher.status === 'ACTIVE' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Redemption Amount (₹)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  max={voucher.face_value}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            )}
          </div>
        )}

        {/* Manual entry tab */}
        {tab === 'manual' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-700">Manual Voucher Entry</h2>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Voucher Reference</label>
              <input
                value={manualRef}
                onChange={e => setManualRef(e.target.value.toUpperCase())}
                placeholder="ANNA-VCH-YYYYMMDD-XXXXXX"
                className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
              />
            </div>
            <button
              onClick={() => fetchVoucher(manualRef)}
              disabled={!manualRef || loading}
              className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? '⏳' : '🔍 Fetch Voucher'}
            </button>
            {voucher && (
              <>
                <VoucherCard voucher={voucher} onRedeem={handleRedeem} loading={loading} />
                {voucher.status === 'ACTIVE' && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Amount (₹)</label>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      max={voucher.face_value}
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Settlement tab */}
        {tab === 'settle' && <SettlementPanel merchantId={merchantId} />}
      </div>

      {/* Offline queue badge */}
      {(() => {
        const q = JSON.parse(localStorage.getItem('annasetu_offline_queue') || '[]');
        return q.length > 0 ? (
          <div className="fixed bottom-4 right-4 bg-yellow-500 text-white text-xs px-3 py-1 rounded-full shadow-lg">
            📴 {q.length} pending sync
          </div>
        ) : null;
      })()}
    </div>
  );
}
