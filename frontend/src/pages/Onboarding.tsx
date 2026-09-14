import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, CheckCircle2 } from 'lucide-react';
// import { GooglePicker } from '../components/GooglePicker'; // To be implemented next

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawFolder, setRawFolder] = useState<{ id: string, name: string } | null>(null);
  const [destFolder, setDestFolder] = useState<{ id: string, name: string } | null>(null);

  const handlePickRaw = () => {
    // Mock picker interaction
    setRawFolder({ id: 'dummy_raw_id', name: 'My Raw Assets' });
    setStep(2);
  };

  const handlePickDest = () => {
    // Mock picker interaction
    setDestFolder({ id: 'dummy_dest_id', name: 'Sorted Assets' });
    setStep(3);
  };

  const handleConfirm = async () => {
    // TODO: Send folder IDs to our backend API to register webhook channel
    console.log('Registering webhook for:', rawFolder?.id, destFolder?.id);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 p-8 sm:p-12 rounded-3xl shadow-xl">
        
        {/* Progress Bar */}
        <div className="flex gap-2 mb-12">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${step >= i ? 'bg-indigo-500' : 'bg-slate-800'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderPlus className="text-indigo-400 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Choose your Raw folder</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Select the Google Drive folder where you will drop your unorganized images. We'll watch this folder automatically.
            </p>
            <button onClick={handlePickRaw} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors">
              Open Google Drive Picker
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderPlus className="text-fuchsia-400 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Choose your Destination</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Select the root folder where we should move your images after they are automatically tagged and renamed.
            </p>
            <button onClick={handlePickDest} className="px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-medium transition-colors">
              Open Google Drive Picker
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="text-green-500 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold mb-4">You're all set!</h2>
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-left max-w-sm mx-auto mb-8">
              <div className="mb-3">
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Raw Folder</span>
                <p className="text-sm font-medium">{rawFolder?.name}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Destination</span>
                <p className="text-sm font-medium">{destFolder?.name}</p>
              </div>
            </div>
            <button onClick={handleConfirm} className="px-8 py-3 bg-white text-slate-900 hover:bg-slate-200 rounded-xl font-medium transition-colors w-full max-w-sm">
              Start Organizing
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
