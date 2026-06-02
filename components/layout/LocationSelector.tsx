'use client';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

const TAMIL_NADU_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chinnor', 'Coimbatore', 'Cuddalore',
  'Dharmapuri', 'Dindugul', 'Erode', 'Kallakurichi', 'Kanchipuram',
  'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
  'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
  'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
  'Thanjavur', 'The Nilgiris', 'Theni', 'Thiruvallur', 'Thiruvannamalai',
  'Tirupati', 'Tirupur', 'Tiruvallur', 'Tiruvannamalai', 'Tirunelveli',
  'Tiruppur', 'Tiruvallur', 'Trichy', 'Vellore', 'Villupuram',
  'Virudunagar'
];

export default function LocationSelector() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/farmer/profile')
      .then(r => r.json())
      .then(data => setLocation(data.location || ''))
      .catch(err => console.error('Failed to fetch location:', err));
  }, []);

  async function updateLocation(newLocation: string) {
    setLoading(true);
    try {
      const res = await fetch('/api/farmer/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: newLocation }),
      });
      if (res.ok) {
        setLocation(newLocation);
      }
    } catch (err) {
      console.error('Failed to update location:', err);
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm hover:text-brand-200 transition-colors px-2 py-1 rounded border border-brand-500"
        disabled={loading}
      >
        <MapPin className="w-3.5 h-3.5" />
        <span className="hidden sm:inline max-w-xs truncate">{location || 'Select'}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 bg-white text-gray-800 rounded shadow-lg z-50 w-48 max-h-60 overflow-y-auto">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search district..."
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-brand-500"
              onChange={(e) => {
                const filtered = TAMIL_NADU_DISTRICTS.filter(d =>
                  d.toLowerCase().includes(e.target.value.toLowerCase())
                );
              }}
            />
          </div>
          {TAMIL_NADU_DISTRICTS.map(district => (
            <button
              key={district}
              onClick={() => updateLocation(district)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors flex items-center gap-2"
            >
              <MapPin className="w-3 h-3 text-brand-600" />
              {district}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
