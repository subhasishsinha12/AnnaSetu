export default function NearbyStores() {
  const stores = [
    { id: 1, name: 'Ramesh Kirana Store', address: 'Adajan, Surat', distance: '0.3 km', type: 'Kirana', open: true },
    { id: 2, name: 'Surat Fair Price Shop #42', address: 'Limbayat, Surat', distance: '0.8 km', type: 'FPS', open: true },
    { id: 3, name: 'Patel General Store', address: 'Varachha, Surat', distance: '1.2 km', type: 'Kirana', open: false }
  ];
  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Nearby Stores</h1>
      <div className="space-y-3">
        {stores.map(s => (
          <div key={s.id} className="bg-white rounded-xl p-4 shadow flex items-start gap-3">
            <div className="text-3xl">{s.type === 'FPS' ? '🏛️' : '🛒'}</div>
            <div className="flex-1">
              <div className="flex justify-between">
                <p className="font-semibold">{s.name}</p>
                <span className={`text-xs px-2 py-1 rounded-full ${s.open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.open ? 'Open' : 'Closed'}
                </span>
              </div>
              <p className="text-sm text-gray-500">{s.address}</p>
              <p className="text-xs text-teal-600 mt-1">📍 {s.distance} away · {s.type}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
