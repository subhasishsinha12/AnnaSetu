import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import axios from 'axios'

export default function Dashboard() {
  const { user } = useAuth()
  const [credits, setCredits] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCredits()
  }, [])

  const fetchCredits = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_FINANCE_API_URL}/api/v1/credits/beneficiary/${user?.aadhaarHash}`)
      setCredits(res.data.data || [])
    } catch (err) {
      console.error('Failed to fetch credits:', err)
    } finally {
      setLoading(false)
    }
  }

  const totalBalance = credits.filter(c => c.status === 'active').reduce((s, c) => s + (c.amount - c.redeemedAmount), 0)

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="mb-8">
        <p className="font-mono text-teal-500 text-xs tracking-widest uppercase">Beneficiary Dashboard</p>
        <h1 className="text-3xl font-serif font-light mt-1">Welcome, {user?.name || 'Beneficiary'}</h1>
        <p className="text-slate-500 text-sm mt-1 font-mono">Ration Card: {user?.rationCardNo || 'GJ-XX-XXXX'}</p>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-orange-950 to-slate-900 border border-orange-900/50 rounded-lg p-8 mb-8">
        <p className="text-orange-300 text-sm font-mono tracking-widest uppercase mb-2">Available Food Credit</p>
        <p className="text-6xl font-serif font-bold text-orange-400">₹{totalBalance.toLocaleString('en-IN')}</p>
        <p className="text-slate-400 text-sm mt-2">Redeemable at any AnnaSetu registered store</p>
        <div className="mt-6 flex gap-3">
          <a href="/redeem" className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded transition-colors">
            Redeem Now →
          </a>
        </div>
      </div>

      {/* Credits List */}
      <div>
        <h2 className="text-lg font-semibold text-slate-300 mb-4">Credit History</h2>
        {loading ? (
          <div className="text-slate-500 text-center py-8">Loading...</div>
        ) : credits.length === 0 ? (
          <div className="text-slate-500 text-center py-8 border border-slate-800 rounded-lg">No credits yet. Check with your local SFDO.</div>
        ) : (
          <div className="space-y-3">
            {credits.map(credit => (
              <div key={credit.creditId} className="bg-slate-900 border border-slate-800 rounded-lg p-5 flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs text-slate-500">{credit.creditId}</p>
                  <p className="text-slate-200 font-semibold mt-1">₹{credit.amount} Food Credit</p>
                  <p className="text-slate-500 text-xs mt-1">Expires: {new Date(credit.expiryDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div className="text-right">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${credit.status === 'active' ? 'bg-green-950 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
                    {credit.status.toUpperCase()}
                  </span>
                  <p className="text-slate-400 text-sm mt-2">Balance: <span className="text-teal-400">₹{credit.amount - credit.redeemedAmount}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
