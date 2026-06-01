'use client';
import { useState } from 'react';
import { User, Phone, MapPin, Layers, Edit2, Save, X } from 'lucide-react';

interface Profile {
  farmer_id: string;
  name: string;
  phone: string;
  land_area_acres: number;
  typography: string;
  preferred_language: string;
  created_at: string;
}

interface Props { profile: Profile; onSave: (data: Partial<Profile>) => Promise<void>; }

export default function ProfileCard({ profile, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: profile.name, typography: profile.typography, landAreaAcres: profile.land_area_acres, preferredLanguage: profile.preferred_language });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center">
            <User className="w-7 h-7 text-brand-700" />
          </div>
          <div>
            {editing ? (
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="text-lg font-bold border-b-2 border-brand-400 outline-none" />
            ) : (
              <h3 className="text-lg font-bold text-gray-800">{profile.name}</h3>
            )}
            <p className="text-sm text-gray-500">Farmer ID: {profile.farmer_id}</p>
          </div>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="flex items-center gap-1 text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800">
            <Edit2 className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <Phone className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">Phone</p><p className="font-medium text-gray-700">{profile.phone}</p></div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <Layers className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">Land Area</p>
            {editing ? (
              <input type="number" value={form.landAreaAcres} onChange={e => setForm({ ...form, landAreaAcres: +e.target.value })}
                className="font-medium w-20 border-b border-brand-400 outline-none" />
            ) : (
              <p className="font-medium text-gray-700">{profile.land_area_acres} acres</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <MapPin className="w-4 h-4 text-gray-400" />
          <div><p className="text-xs text-gray-400">Land Type</p>
            {editing ? (
              <input value={form.typography} onChange={e => setForm({ ...form, typography: e.target.value })}
                className="font-medium border-b border-brand-400 outline-none" />
            ) : (
              <p className="font-medium text-gray-700">{profile.typography || '—'}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
          <div className="w-4 h-4 text-gray-400 font-bold text-xs flex items-center justify-center">A</div>
          <div><p className="text-xs text-gray-400">Language</p>
            {editing ? (
              <select value={form.preferredLanguage} onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}
                className="font-medium border-b border-brand-400 outline-none">
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
                <option value="ta">தமிழ்</option>
              </select>
            ) : (
              <p className="font-medium text-gray-700">{{ en: 'English', hi: 'हिन्दी', ta: 'தமிழ்' }[profile.preferred_language] ?? profile.preferred_language}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
