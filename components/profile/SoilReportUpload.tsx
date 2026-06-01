'use client';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

interface SoilData {
  ph: number;
  nitrogen: string;
  phosphorus: string;
  potassium: string;
  organicCarbon: string;
  recommendations: string;
  labName: string;
  reportDate: string;
}

interface Props { onUploadSuccess: (data: SoilData) => void; }

export default function SoilReportUpload({ onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<SoilData | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/soil/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return; }
      setResult(data.soilData);
      onUploadSuccess(data.soilData);
    } catch { setError('Upload failed. Please try again.'); }
    finally { setUploading(false); }
  }, [onUploadSuccess]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'image/*': [], 'application/pdf': ['.pdf'] }, maxFiles: 1, maxSize: 10 * 1024 * 1024,
  });

  return (
    <div className="space-y-4">
      <div {...getRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? 'border-brand-400 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'}`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-10 h-10 text-brand-500 animate-spin" />
            <p className="text-brand-600 font-medium">Analyzing soil report with AI...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-10 h-10 text-gray-400" />
            <p className="font-medium text-gray-700">Drop soil report here</p>
            <p className="text-sm">or click to browse (JPEG, PNG, PDF — max 10MB)</p>
          </div>
        )}
      </div>

      {error && <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-3"><AlertCircle className="w-4 h-4" />{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-green-800">Soil Report Extracted</h4>
            {result.labName && <span className="text-sm text-green-600 ml-auto">{result.labName}</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'pH', value: result.ph },
              { label: 'Nitrogen', value: result.nitrogen },
              { label: 'Phosphorus', value: result.phosphorus },
              { label: 'Potassium', value: result.potassium },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-xl p-3 text-center shadow-sm">
                <p className="text-xs text-gray-500">{item.label}</p>
                <p className="font-bold text-gray-800 mt-1">{item.value ?? '—'}</p>
              </div>
            ))}
          </div>
          {result.recommendations && (
            <div className="bg-white rounded-xl p-3">
              <p className="text-xs font-medium text-gray-500 mb-1">AI Recommendations</p>
              <p className="text-sm text-gray-700">{result.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
