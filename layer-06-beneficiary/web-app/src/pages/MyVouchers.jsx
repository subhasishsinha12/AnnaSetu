/**
 * AnnaSetu — MyVouchers page
 * Shows all e-RUPI vouchers for the logged-in beneficiary with live QR codes
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';

const API = '/api/erupi';

const STATUS_STYLE = {
  ACTIVE:         'bg-green-100 text-green-700',
  FULLY_REDEEMED: 'bg-gray-100 text-gray-500',
  EXPIRED:        'bg-red-100 text-red-600',
};

// Demo voucher for first-time / offline view
const DEMO_VOUCHER = {
  voucherId: 'ERUPI-DEMO0001',
  amountINR: 1000,
  balanceINR: 850,
  status: 'ACTIVE',
  expiryDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
  nfsaCategory: 'PHH',
};

export default function MyVouchers() {
  const { t } = useTranslation();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const beneficiaryId = localStorage.getItem('beneficiaryId') || 'BEN-DEMO';

  useEffect(() => {
    fetch(`${API}/api/v1/beneficiary/${beneficiaryId}/vouchers`)
      .then(r => r.json())
      .then(d => setVouchers(d.vouchers?.length ? d.vouchers : [DEMO_VOUCHER]))
      .catch(() => setVouchers([DEMO_VOUCHER]))
      .finally(() => setLoading(false));
  }, [beneficiaryId]);

  const totalBalance = vouchers.filter(v => v.status === 'ACTIVE').reduce((s, v) => s + (v.balanceINR || 0), 0);

  return (
    <div className="max-w-md mx-auto p-4">
      {/* Balance summary */}
      <div className="bg-gradient-to-br from-amber-700 to-amber-600 text-white rounded-2xl p-5 mb-5 shadow-lg">
        <p className="text-amber-200 text-xs uppercase tracking-widest">{t('voucherBalance')}</p>
        <p className="text-4xl font-bold mt-1">₹{totalBalance.toLocaleString('en-IN')}</p>
        <p className="text-amber-300 text-xs mt-2">{vouchers.filter(v => v.status === 'ACTIVE').length} active voucher(s)</p>
      </div>

      {loading && (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl animate-spin inline-block mb-2">🌾</div>
          <p className="text-sm">{t('loading')}</p>
        </div>
      )}

      {!loading && vouchers.map(v => (
        <div key={v.voucherId}
          onClick={() => setSelected(selected?.voucherId === v.voucherId ? null : v)}
          className="bg-white rounded-2xl p-4 mb-3 shadow border border-gray-100 cursor-pointer hover:border-amber-200 transition-colors">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest">Food Voucher</p>
              <p className="font-mono font-bold text-gray-800">{v.voucherId}</p>
              {v.nfsaCategory && <p className="text-xs text-green-600">NFSA: {v.nfsaCategory}</p>}
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_STYLE[v.status] || 'bg-gray-100'}`}>
              {t(v.status?.toLowerCase()) || v.status}
            </span>
          </div>

          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-amber-700">₹{(v.balanceINR || 0).toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-400">of ₹{(v.amountINR || 0)} · {t('expiresOn')}: {new Date(v.expiryDate).toLocaleDateString('en-IN')}</p>
            </div>
            <span className="text-gray-400 text-sm">{selected?.voucherId === v.voucherId ? '▲' : '▼'}</span>
          </div>

          {/* QR expanded view */}
          {selected?.voucherId === v.voucherId && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-center" onClick={e => e.stopPropagation()}>
              <p className="text-xs text-gray-500 mb-3">{t('scanQR')}</p>
              <QRCodeSVG
                value={`annasetu://voucher?id=${v.voucherId}&amt=${v.balanceINR}&purpose=FOOD`}
                size={180}
                className="mx-auto"
              />
              <p className="text-xs text-gray-400 mt-2">{v.voucherId}</p>
            </div>
          )}
        </div>
      ))}

      {!loading && vouchers.length === 0 && (
        <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow">
          <div className="text-5xl mb-3">🎟️</div>
          <p className="font-medium">No vouchers yet</p>
          <p className="text-sm mt-1">Check eligibility to receive your food credits</p>
          <a href="/check" className="inline-block mt-4 bg-green-700 text-white px-5 py-2 rounded-xl text-sm font-bold">
            Check Eligibility
          </a>
        </div>
      )}
    </div>
  );
}
