/**
 * AnnaSetu — EligibilityCheck page
 * Aadhaar OTP-based KYC → NFSA lookup → onboard beneficiary
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const KYC_API = '/api/kyc';
const ERUPI_API = '/api/erupi';

export default function EligibilityCheck() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);           // 1=aadhaar, 2=otp, 3=result
  const [aadhaar, setAadhaar] = useState('');
  const [rationCard, setRationCard] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sendOTP = async () => {
    if (aadhaar.length !== 12) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${KYC_API}/api/v1/kyc/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar_number: aadhaar, mobile_last4: '0000' })
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setStep(2);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const verifyAndCheck = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setError('');
    try {
      // Step 1 — verify OTP
      const kycRes = await fetch(`${KYC_API}/api/v1/kyc/verify-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aadhaar_number: aadhaar, otp, session_id: sessionId })
      });
      const kycData = await kycRes.json();
      if (!kycRes.ok) throw new Error(kycData.detail || 'OTP verification failed');

      // Step 2 — NFSA lookup
      const nfsaRes = await fetch(`${KYC_API}/api/v1/nfsa/lookup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ration_card_no: rationCard || 'GJ-DEMO-0001', state: 'Gujarat' })
      });
      const nfsaData = await nfsaRes.json();

      // Step 3 — Issue e-RUPI voucher
      const voucherRes = await fetch(`${ERUPI_API}/api/v1/vouchers/issue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beneficiaryId: `BEN-${aadhaar.slice(-4)}`,
          aadhaarHash: kycData.aadhaar_hash,
          mobile: '9999999999',
          nfsaCategory: nfsaData.nfsa_data?.category || 'PHH',
          districtCode: 'GJ-SUR'
        })
      });
      const voucherData = await voucherRes.json();

      localStorage.setItem('beneficiaryId', `BEN-${aadhaar.slice(-4)}`);
      setResult({ kyc: kycData, nfsa: nfsaData.nfsa_data, voucher: voucherData });
      setStep(3);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-700 to-green-600 text-white rounded-2xl p-5 mb-6 shadow">
        <h1 className="text-xl font-bold">✅ {t('checkEligibility')}</h1>
        <p className="text-green-200 text-sm mt-1">Aadhaar eKYC + NFSA Verification — Step {step}/3</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-4 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Step 1 — Aadhaar entry */}
      {step === 1 && (
        <div className="bg-white rounded-xl p-5 shadow space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">Aadhaar Number</label>
            <input value={aadhaar} onChange={e => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 font-mono tracking-widest text-center text-lg"
              placeholder="xxxx xxxx xxxx" inputMode="numeric" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1">{t('rationCard')} (optional)</label>
            <input value={rationCard} onChange={e => setRationCard(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              placeholder="GJ-XXXX-XXXX" />
          </div>
          <button onClick={sendOTP} disabled={aadhaar.length !== 12 || loading}
            className="w-full bg-green-700 text-white rounded-xl py-3 font-bold disabled:opacity-50 transition-opacity">
            {loading ? '⏳ Sending OTP…' : `${t('getOTP')} →`}
          </button>
          <p className="text-xs text-gray-400 text-center">Demo OTP will be: <strong>123456</strong></p>
        </div>
      )}

      {/* Step 2 — OTP */}
      {step === 2 && (
        <div className="bg-white rounded-xl p-5 shadow space-y-4">
          <p className="text-sm text-gray-600">Enter OTP sent to Aadhaar-linked mobile</p>
          <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full border border-gray-200 rounded-xl px-3 py-3 text-center text-3xl font-bold tracking-[1rem]"
            placeholder="------" inputMode="numeric" maxLength={6} />
          <button onClick={verifyAndCheck} disabled={otp.length !== 6 || loading}
            className="w-full bg-green-700 text-white rounded-xl py-3 font-bold disabled:opacity-50">
            {loading ? '⏳ Verifying…' : `${t('verifyOTP')} & Check Eligibility`}
          </button>
          <button onClick={() => setStep(1)} className="w-full text-gray-500 text-sm">← Back</button>
        </div>
      )}

      {/* Step 3 — Result */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-300 rounded-2xl p-5 text-center shadow">
            <div className="text-5xl mb-2">✅</div>
            <h2 className="text-2xl font-bold text-green-800">{t('eligible')}</h2>
            <p className="text-green-600 text-sm mt-1">NFSA Category: <strong>{result.nfsa?.category}</strong></p>
          </div>

          {result.voucher?.success && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Food Credit Issued</p>
              <p className="text-3xl font-bold text-amber-700">₹{result.voucher.amountINR}</p>
              <p className="text-xs text-gray-500 mt-1">Voucher: {result.voucher.voucherId}</p>
              <p className="text-xs text-gray-400">Valid until: {new Date(result.voucher.expiryDate).toLocaleDateString('en-IN')}</p>
            </div>
          )}

          <div className="bg-white rounded-xl p-4 shadow text-sm space-y-2">
            <p className="font-semibold text-gray-700">NFSA Benefits</p>
            {result.nfsa?.scheme_benefits?.map(b => (
              <div key={b} className="flex items-center gap-2 text-gray-600">
                <span className="text-green-500">✓</span> {b.replace('_', ' ')}
              </div>
            ))}
          </div>

          <a href="/vouchers"
            className="block w-full bg-green-700 text-white text-center rounded-xl py-3 font-bold">
            View My Vouchers →
          </a>
        </div>
      )}
    </div>
  );
}
