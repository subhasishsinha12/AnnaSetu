import { useState } from 'react';
import axios from 'axios';

const KYC_API = import.meta.env.VITE_KYC_API || 'http://localhost:8001';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [aadhaar, setAadhaar] = useState('');
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [kycToken, setKycToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const sendOTP = async () => {
    setLoading(true);
    try {
      const resp = await axios.post(`${KYC_API}/api/v1/kyc/send-otp`, { aadhaar_number: aadhaar, mobile_last4: '0000' });
      setSessionId(resp.data.session_id);
      setMsg(`OTP sent! (Demo OTP: 123456)`);
      setStep(2);
    } catch (e) { setMsg(e.response?.data?.detail || e.message); }
    setLoading(false);
  };

  const verifyOTP = async () => {
    setLoading(true);
    try {
      const resp = await axios.post(`${KYC_API}/api/v1/kyc/verify-otp`, { aadhaar_number: aadhaar, otp, session_id: sessionId });
      setKycToken(resp.data.kyc_token);
      setMsg('Identity verified successfully!');
      setStep(3);
    } catch (e) { setMsg(e.response?.data?.detail || e.message); }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <div className="bg-amber-700 text-white rounded-2xl p-5 mb-6">
        <h1 className="text-xl font-bold">🪪 Beneficiary Onboarding</h1>
        <p className="text-amber-200 text-sm">Step {step} of 3 — Aadhaar eKYC</p>
      </div>
      {step === 1 && (
        <div className="bg-white rounded-xl p-5 shadow space-y-4">
          <p className="text-sm text-gray-600">Enter your 12-digit Aadhaar number to verify your identity</p>
          <input value={aadhaar} onChange={e => setAadhaar(e.target.value)} maxLength={12}
            className="w-full border rounded-lg px-3 py-2" placeholder="xxxx xxxx xxxx" />
          <button onClick={sendOTP} disabled={aadhaar.length !== 12 || loading}
            className="w-full bg-amber-700 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {loading ? 'Sending...' : 'Send OTP to Mobile'}
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="bg-white rounded-xl p-5 shadow space-y-4">
          <p className="text-sm text-gray-600">Enter OTP sent to Aadhaar-linked mobile</p>
          <input value={otp} onChange={e => setOtp(e.target.value)} maxLength={6}
            className="w-full border rounded-lg px-3 py-2 text-center text-2xl tracking-widest" placeholder="------" />
          <button onClick={verifyOTP} disabled={otp.length !== 6 || loading}
            className="w-full bg-amber-700 text-white rounded-lg py-3 font-semibold disabled:opacity-50">
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </div>
      )}
      {step === 3 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-xl font-bold text-green-800">Identity Verified!</h2>
          <p className="text-sm text-green-600 mt-2">Your AnnaSetu food credits will be activated shortly</p>
          <p className="text-xs text-gray-400 mt-3">Token: {kycToken?.substring(0, 16)}...</p>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-center text-amber-700">{msg}</p>}
    </div>
  );
}
