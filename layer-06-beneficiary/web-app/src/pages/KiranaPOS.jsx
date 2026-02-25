import { useState } from 'react';
import axios from 'axios';

const API = '/api/erupi';

export default function KiranaPOS() {
  const [voucherId, setVoucherId] = useState('');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleRedeem = async () => {
    if (!voucherId || !amount) return;
    setLoading(true);
    try {
      const resp = await axios.post(`${API}/api/v1/vouchers/redeem`, {
        voucherId, merchantId: 'MERCHANT-SURAT-001',
        merchantUPI: 'merchant@upi', amountINR: parseFloat(amount)
      });
      setResult(resp.data);
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-teal-700 text-white rounded-2xl p-5 mb-6">
        <h1 className="text-xl font-bold">🏪 Kirana POS Terminal</h1>
        <p className="text-teal-200 text-sm">AnnaSetu Food Credit Redemption</p>
      </div>
      <div className="bg-white rounded-xl p-5 shadow space-y-4">
        <div>
          <label className="text-sm text-gray-500 block mb-1">Voucher ID / QR Scan</label>
          <input value={voucherId} onChange={e => setVoucherId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="ERUPI-XXXXXXXXXX" />
        </div>
        <div>
          <label className="text-sm text-gray-500 block mb-1">Amount to Deduct (₹)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Enter amount" />
        </div>
        <button onClick={handleRedeem} disabled={loading}
          className="w-full bg-teal-700 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
          {loading ? 'Processing...' : '⚡ Process Payment'}
        </button>
      </div>
      {result && (
        <div className={`mt-4 rounded-xl p-4 ${result.error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {result.error ? (
            <p className="text-red-700 text-sm">❌ {result.error}</p>
          ) : (
            <div className="text-green-800">
              <p className="font-bold">✅ Payment Successful</p>
              <p className="text-sm">Amount: ₹{result.amountINR}</p>
              <p className="text-sm">Remaining Balance: ₹{result.remainingBalance}</p>
              <p className="text-xs text-green-600 mt-1">UPI Ref: {result.upiRefNo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
