/**
 * AnnaSetu — RedeemPage
 * Beneficiary-side QR display + manual voucher redemption at kirana/FPS
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

const API = '/api/erupi';

export default function RedeemPage() {
  const { t } = useTranslation();
  const [vouchers, setVouchers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [redeemStatus, setRedeemStatus] = useState(null);

  const beneficiaryId = localStorage.getItem('beneficiaryId') || 'BEN-DEMO';

  useEffect(() => {
    fetch(`${API}/api/v1/beneficiary/${beneficiaryId}/vouchers`)
      .then(r => r.json())
      .then(d => {
        const active = (d.vouchers || []).filter(v => v.status === 'ACTIVE');
        setVouchers(active);
        if (active.length) setSelected(active[0]);
      })
      .catch(() => {
        const demo = {
          voucherId: 'ERUPI-DEMO0001', amountINR: 1000, balanceINR: 850,
          status: 'ACTIVE', expiryDate: new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString()
        };
        setVouchers([demo]);
        setSelected(demo);
      })
      .finally(() => setLoading(false));
  }, [beneficiaryId]);

  const handleTestRedeem = async () => {
    if (!selected) return;
    setRedeemStatus('loading');
    try {
      const res = await fetch(`${API}/api/v1/vouchers/redeem`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherId: selected.voucherId,
          merchantId: 'KIRANA-SURAT-DEMO',
          merchantUPI: 'kirana@ybl',
          amountINR: 100,
          items: [{ name: 'Rice 5kg', category: 'food', qty: 1 }]
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRedeemStatus({ success: true, ...data });
      setSelected(prev => prev ? { ...prev, balanceINR: data.remainingBalance } : null);
    } catch (e) {
      setRedeemStatus({ error: e.message });
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-gradient-to-r from-teal-700 to-teal-600 text-white rounded-2xl p-5 mb-5 shadow">
        <h1 className="text-xl font-bold">📷 {t('redeemVoucher')}</h1>
        <p className="text-teal-200 text-sm mt-1">Show QR code at any authorised store</p>
      </div>

      {loading && <div className="text-center py-10 text-gray-400 animate-pulse">Loading vouchers…</div>}

      {!loading && vouchers.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow">
          <p className="text-4xl mb-3">🎟️</p>
          <p>No active vouchers</p>
          <a href="/check" className="inline-block mt-4 bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-bold">
            Get Vouchers
          </a>
        </div>
      )}

      {!loading && selected && (
        <div className="space-y-4">
          {/* Voucher selector (if multiple) */}
          {vouchers.length > 1 && (
            <div className="bg-white rounded-xl p-3 shadow">
              <label className="text-xs text-gray-500 block mb-1">Select Voucher</label>
              <select
                value={selected.voucherId}
                onChange={e => setSelected(vouchers.find(v => v.voucherId === e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              >
                {vouchers.map(v => (
                  <option key={v.voucherId} value={v.voucherId}>
                    {v.voucherId} — ₹{v.balanceINR}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* QR Code card */}
          <div className="bg-white rounded-2xl p-5 shadow text-center">
            <QRCodeSVG
              value={`annasetu://voucher?id=${selected.voucherId}&amt=${selected.balanceINR}&purpose=FOOD`}
              size={220}
              className="mx-auto"
              level="H"
            />
            <p className="font-mono text-sm font-bold text-gray-700 mt-3">{selected.voucherId}</p>
            <div className="flex justify-around mt-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs">Balance</p>
                <p className="font-bold text-amber-700 text-xl">₹{selected.balanceINR}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">Valid Until</p>
                <p className="font-bold text-gray-700">{new Date(selected.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
              </div>
            </div>
          </div>

          {/* Demo redemption */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-bold text-amber-700 mb-2">🧪 DEMO — Test Redemption (₹100)</p>
            <button onClick={handleTestRedeem} disabled={redeemStatus === 'loading'}
              className="w-full bg-amber-600 text-white rounded-xl py-2.5 font-bold text-sm disabled:opacity-50">
              {redeemStatus === 'loading' ? '⏳ Processing…' : '⚡ Simulate ₹100 Kirana Purchase'}
            </button>
          </div>

          {redeemStatus && redeemStatus !== 'loading' && (
            <div className={`rounded-xl p-4 ${redeemStatus.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
              {redeemStatus.error ? (
                <p className="text-red-700 text-sm">❌ {redeemStatus.error}</p>
              ) : (
                <div className="text-green-800">
                  <p className="font-bold">✅ {t('success')}</p>
                  <p className="text-sm">Redeemed ₹100 at KIRANA-SURAT-DEMO</p>
                  <p className="text-sm">Remaining Balance: ₹{redeemStatus.remainingBalance}</p>
                  <p className="text-xs text-green-600 mt-1">UPI Ref: {redeemStatus.upiRefNo}</p>
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 space-y-1">
            <p className="font-semibold text-gray-700 mb-2">How to pay at store:</p>
            <p>1. Show this QR to the shopkeeper</p>
            <p>2. Tell them the amount for food items</p>
            <p>3. They will scan & process payment</p>
            <p>4. You'll receive an SMS confirmation</p>
          </div>
        </div>
      )}
    </div>
  );
}
