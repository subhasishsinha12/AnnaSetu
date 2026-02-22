import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function Vouchers() {
  const [activeVoucher, setActiveVoucher] = useState(null);
  const demoVoucher = { voucherId: 'ERUPI-DEMO0001', amountINR: 1000, balanceINR: 850, status: 'ACTIVE', expiryDate: '2026-03-22' };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">My Vouchers</h1>
      <div className="bg-white rounded-2xl p-5 shadow-lg border border-amber-100">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Food Voucher</p>
            <p className="font-bold text-lg">{demoVoucher.voucherId}</p>
          </div>
          <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">{demoVoucher.status}</span>
        </div>
        <div className="text-center my-4">
          <p className="text-3xl font-bold text-amber-700">₹{demoVoucher.balanceINR}</p>
          <p className="text-sm text-gray-400">of ₹{demoVoucher.amountINR} remaining</p>
        </div>
        <div className="flex justify-center my-4">
          <QRCodeSVG value={`annasetu://voucher?id=${demoVoucher.voucherId}&amt=${demoVoucher.balanceINR}`} size={160} />
        </div>
        <p className="text-center text-xs text-gray-400">Show this QR at any authorised store</p>
        <p className="text-center text-xs text-gray-400 mt-1">Valid until {demoVoucher.expiryDate}</p>
      </div>
    </div>
  );
}
