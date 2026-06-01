'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Sprout } from 'lucide-react';
import FarmerDetailsForm, { type FarmerFormData } from '@/components/register/FarmerDetailsForm';

const LandMapSelector = dynamic(() => import('@/components/register/LandMapSelector'), {
  ssr: false,
  loading: () => <div className="h-80 bg-gray-100 rounded-2xl animate-pulse flex items-center justify-center text-gray-400">Loading map...</div>,
});

interface Coordinate { lat: number; lng: number; }
type Step = 'details' | 'map' | 'password';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [formData, setFormData] = useState<FarmerFormData | null>(null);
  const [coords, setCoords] = useState<Coordinate[]>([]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function onDetailsNext(data: FarmerFormData) {
    setFormData(data);
    setStep('map');
  }

  async function register() {
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, landCoordinates: coords, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Registration failed'); return; }
      router.push('/login?registered=1');
    } catch { setError('Network error. Please try again.'); }
    finally { setLoading(false); }
  }

  const steps = ['Details', 'Land Map', 'Password'];
  const stepIndex = { details: 0, map: 1, password: 2 }[step];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-earth-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl">
        <div className="flex items-center gap-2 justify-center mb-6">
          <Sprout className="w-7 h-7 text-brand-600" />
          <span className="text-xl font-bold text-brand-700">FarmAdvisor — Register</span>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${i <= stepIndex ? 'bg-brand-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{i + 1}</div>
              <span className={`text-sm ${i === stepIndex ? 'font-semibold text-brand-700' : 'text-gray-400'}`}>{s}</span>
              {i < steps.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
            </div>
          ))}
        </div>

        {step === 'details' && <FarmerDetailsForm onNext={onDetailsNext} />}

        {step === 'map' && (
          <div className="space-y-4">
            <LandMapSelector onChange={setCoords} />
            <div className="flex gap-3">
              <button onClick={() => setStep('details')} className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl hover:bg-gray-50">Back</button>
              <button onClick={() => setStep('password')} disabled={coords.length < 3}
                className="flex-1 bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 font-semibold">
                Next: Set Password →
              </button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <div className="space-y-4 max-w-sm mx-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Create Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat password"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 text-sm" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('map')} className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl hover:bg-gray-50">Back</button>
              <button onClick={register} disabled={loading}
                className="flex-1 bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 font-semibold">
                {loading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        )}

        <p className="text-sm text-center text-gray-500 mt-6">
          Already registered?{' '}
          <Link href="/login" className="text-brand-600 hover:text-brand-800 font-medium">Login</Link>
        </p>
      </div>
    </div>
  );
}
