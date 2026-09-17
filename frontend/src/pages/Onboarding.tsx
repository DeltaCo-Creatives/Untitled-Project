import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, CheckCircle2, Loader2, Search } from 'lucide-react';
import { api, type DriveFolder } from '../lib/api';

type Step = 'loading' | 'connect' | 'raw' | 'dest' | 'confirm' | 'saving';

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('loading');
  const [error, setError] = useState<string | null>(null);

  const [rawFolder, setRawFolder] = useState<DriveFolder | null>(null);
  const [destFolder, setDestFolder] = useState<DriveFolder | null>(null);

  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [query, setQuery] = useState('');
  const [foldersLoading, setFoldersLoading] = useState(false);

  // Figure out where the user should start: already connected + configured
  // users skip straight to confirm/dashboard rather than re-picking folders.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { driveConnected, config } = await api.me();
        if (cancelled) return;
        if (!driveConnected) {
          setStep('connect');
          return;
        }
        if (config) {
          setRawFolder({ id: config.rawFolderId, name: config.rawFolderName });
          setDestFolder({ id: config.destinationFolderId, name: config.destinationFolderName });
          setStep('confirm');
          return;
        }
        setStep('raw');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load account');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 'raw' && step !== 'dest') return;
    let cancelled = false;
    setFoldersLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const { folders } = await api.listFolders(query || undefined);
        if (!cancelled) setFolders(folders);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load folders');
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, query]);

  const handleConnectDrive = async () => {
    setError(null);
    try {
      const { authUrl } = await api.startGoogleAuth();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Google Drive connection');
    }
  };

  const handlePickRaw = (folder: DriveFolder) => {
    setRawFolder(folder);
    setQuery('');
    setStep('dest');
  };

  const handlePickDest = (folder: DriveFolder) => {
    setDestFolder(folder);
    setQuery('');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!rawFolder || !destFolder) return;
    setStep('saving');
    setError(null);
    try {
      await api.saveConfig(rawFolder.id, destFolder.id);
      await api.startWatch();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save your configuration');
      setStep('confirm');
    }
  };

  const progress = { loading: 0, connect: 1, raw: 1, dest: 2, confirm: 3, saving: 3 }[step];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 p-8 sm:p-12 rounded-3xl shadow-xl">
        <div className="flex gap-2 mb-12">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${progress >= i ? 'bg-indigo-500' : 'bg-slate-800'}`} />
          ))}
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {step === 'loading' && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        )}

        {step === 'connect' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderPlus className="text-indigo-400 w-8 h-8" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Connect Google Drive</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              DriveTag needs its own Google Drive authorization, separate from your login, so it can
              keep watching your folder even while you're away.
            </p>
            <button
              onClick={handleConnectDrive}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
            >
              Connect Google Drive
            </button>
          </div>
        )}

        {(step === 'raw' || step === 'dest') && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                <FolderPlus className={`w-8 h-8 ${step === 'raw' ? 'text-indigo-400' : 'text-fuchsia-400'}`} />
              </div>
              <h2 className="text-3xl font-bold mb-4">
                {step === 'raw' ? 'Choose your Raw folder' : 'Choose your Destination'}
              </h2>
              <p className="text-slate-400 max-w-md mx-auto">
                {step === 'raw'
                  ? "Select the Google Drive folder where you'll drop unorganized images. We'll watch this folder automatically."
                  : 'Select the folder where tagged images should be moved to after processing.'}
              </p>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search folders…"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800 divide-y divide-slate-800/60">
              {foldersLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                </div>
              )}
              {!foldersLoading && folders.length === 0 && (
                <p className="text-center text-sm text-slate-500 py-8">No folders found.</p>
              )}
              {!foldersLoading &&
                folders
                  .filter((f) => step === 'dest' ? f.id !== rawFolder?.id : true)
                  .map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => (step === 'raw' ? handlePickRaw(folder) : handlePickDest(folder))}
                      className="w-full text-left px-4 py-3 text-sm text-slate-200 hover:bg-slate-800/60 transition-colors"
                    >
                      {folder.name}
                    </button>
                  ))}
            </div>
          </div>
        )}

        {(step === 'confirm' || step === 'saving') && (
          <div className="text-center">
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
            <button
              onClick={handleConfirm}
              disabled={step === 'saving'}
              className="px-8 py-3 bg-white text-slate-900 hover:bg-slate-200 disabled:opacity-60 rounded-xl font-medium transition-colors w-full max-w-sm inline-flex items-center justify-center gap-2"
            >
              {step === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
              {step === 'saving' ? 'Starting…' : 'Start Organizing'}
            </button>
            <button
              onClick={() => setStep('raw')}
              disabled={step === 'saving'}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-60"
            >
              Choose different folders
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
