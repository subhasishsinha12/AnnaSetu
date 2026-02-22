import { Link } from 'react-router-dom'

export default function Home() {
  const stats = [
    { label: 'Food Waste/Year', value: '78M', unit: 'Tonnes', color: 'text-orange-400' },
    { label: 'Undernourished', value: '200M', unit: 'Indians', color: 'text-red-400' },
    { label: 'Jan Dhan Accounts', value: '56Cr', unit: 'Wallets', color: 'text-teal-400' },
    { label: 'Credits Issued', value: '0', unit: '(Pilot)', color: 'text-green-400' },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative py-32 px-6 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-950/20 to-transparent pointer-events-none" />
        <p className="text-orange-400 text-sm tracking-[8px] uppercase mb-4 font-mono">अन्न सेतु</p>
        <h1 className="text-6xl md:text-8xl font-serif font-light mb-4 bg-gradient-to-br from-orange-300 via-amber-300 to-orange-500 bg-clip-text text-transparent">
          Anna<span className="font-bold italic">Setu</span>
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-2 tracking-wide">
          India's Blockchain-Enabled Food Bridge
        </p>
        <p className="text-slate-500 font-mono text-sm tracking-widest mb-12">
          FROM SURPLUS TO SECURITY
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/dashboard" className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white font-semibold rounded transition-all hover:shadow-lg hover:shadow-orange-500/20">
            Beneficiary Portal
          </Link>
          <Link to="/kirana" className="px-8 py-3 border border-teal-600 hover:bg-teal-950 text-teal-400 font-semibold rounded transition-all">
            Kirana / Merchant
          </Link>
          <Link to="/surplus-map" className="px-8 py-3 border border-slate-600 hover:bg-slate-800 text-slate-300 font-semibold rounded transition-all">
            Live Surplus Map
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-800 border-t border-b border-slate-800">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-950 py-8 px-6 text-center">
            <span className={`block font-serif text-5xl font-bold ${s.color}`}>{s.value}</span>
            <span className="block text-slate-400 text-xs font-mono tracking-widest mt-1 uppercase">{s.unit}</span>
            <span className="block text-slate-500 text-xs mt-2">{s.label}</span>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <p className="font-mono text-teal-500 text-xs tracking-[4px] uppercase mb-3">How It Works</p>
        <h2 className="text-4xl font-serif font-light text-slate-100 mb-12">
          Shelf to <span className="italic text-amber-400">Plate in 6 Steps</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { n:'01', icon:'🏷️', title:'Detection', desc:'Supermarket POS flags near-expiry items automatically via ERP webhook' },
            { n:'02', icon:'📡', title:'ONDC Listing', desc:'Smart contract broadcasts surplus to NGO Buyer Apps on Beckn Protocol' },
            { n:'03', icon:'🤝', title:'NGO Match', desc:'Nearest qualified SFDO confirms pickup within minutes' },
            { n:'04', icon:'🚚', title:'Collection', desc:'IoT-tracked cold chain pickup. Quality verified. 80G cert auto-issued.' },
            { n:'05', icon:'💳', title:'Food Credit', desc:'IDBI Bank loads e-RUPI voucher to your Jan Dhan / mobile number' },
            { n:'06', icon:'🛒', title:'Your Choice', desc:'Redeem at any kirana or Fair Price Shop. You choose what your family needs.' },
          ].map(step => (
            <div key={step.n} className="bg-slate-900 border border-slate-800 p-6 hover:border-orange-900 transition-colors">
              <span className="text-3xl mb-3 block">{step.icon}</span>
              <span className="font-mono text-xs text-slate-600 tracking-widest">STEP {step.n}</span>
              <h3 className="font-bold text-orange-400 mt-1 mb-2">{step.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
