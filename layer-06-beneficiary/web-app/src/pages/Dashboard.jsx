import { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_ERUPI_API || 'http://localhost:3005';

export default function Dashboard() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(false);
  const beneficiaryId = localStorage.getItem('beneficiaryId') || 'BEN-DEMO';

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/v1/beneficiary/${beneficiaryId}/vouchers`)
      .then(r => setVouchers(r.data.vouchers || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [beneficiaryId]);

  const totalBalance = vouchers.filter(v => v.status === 'ACTIVE').reduce((s, v) => s + v.balanceINR, 0);

  return (
    <div className="max-w-md mx-auto p-4">
      {/* Header */}
      <div className="bg-amber-700 text-white rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-3xl">🌾</span>
          <div>
            <h1 className="text-xl font-bold">AnnaSetu</h1>
            <p className="text-amber-200 text-sm">Your Food Credit Wallet</p>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-amber-200 text-xs uppercase tracking-widest">Available Balance</p>
          <p className="text-4xl font-bold">₹{totalBalance.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: '🛒', label: 'Use Credit', href: '/vouchers' },
          { icon: '🗺️', label: 'Nearby Stores', href: '/stores' },
          { icon: '📋', label: 'My History', href: '/vouchers' }
        ].map(action => (
          <a key={action.label} href={action.href}
            className="bg-white rounded-xl p-3 text-center shadow hover:shadow-md transition-shadow">
            <div className="text-2xl mb-1">{action.icon}</div>
            <div className="text-xs text-gray-600 font-medium">{action.label}</div>
          </a>
        ))}
      </div>

      {/* Active Vouchers */}
      <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
        <span>🎫</span> Active Food Credits
      </h2>
      {loading && <div className="text-center py-8 text-gray-400">Loading...</div>}
      {!loading && vouchers.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow">
          <div className="text-4xl mb-3">🌾</div>
          <p>No active credits yet</p>
          <p className="text-sm mt-1">Credits are loaded monthly</p>
        </div>
      )}
      {vouchers.map(v => (
        <div key={v.voucherId} className="bg-white rounded-xl p-4 mb-3 shadow flex justify-between items-center">
          <div>
            <p className="font-semibold text-gray-800">Food Credit Voucher</p>
            <p className="text-xs text-gray-500">{v.voucherId}</p>
            <p className="text-xs text-gray-400">Valid until {new Date(v.expiryDate).toLocaleDateString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-amber-700">₹{v.balanceINR}</p>
            <span className={`text-xs px-2 py-1 rounded-full ${v.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {v.status}
            </span>
          </div>
        </div>
      ))}

      {/* How to use */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
        <h3 className="font-semibold text-amber-800 mb-2">How to use your credit</h3>
        <ol className="text-sm text-amber-700 space-y-1">
          <li>1. Go to any authorised kirana store or Fair Price Shop</li>
          <li>2. Choose vegetables, pulses, milk, eggs — any nutritious food</li>
          <li>3. Show your voucher QR code or SMS at checkout</li>
          <li>4. Payment deducted from your food credit balance</li>
        </ol>
      </div>
    </div>
  );
}
