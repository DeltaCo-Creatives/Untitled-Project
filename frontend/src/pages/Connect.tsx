import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

export default function Connect() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const error = searchParams.get('error');
  const connected = searchParams.get('connected');

  useEffect(() => {
    const timer = setTimeout(
      () => navigate('/onboarding', { replace: true }),
      error ? 3500 : 1200,
    );
    return () => clearTimeout(timer);
  }, [error, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 p-8 sm:p-12 rounded-3xl shadow-2xl flex flex-col items-center">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6">
              <XCircle className="text-red-500 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Couldn't connect Google Drive</h1>
            <p className="text-slate-400 text-sm">{error}</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="text-green-500 w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">Google Drive connected</h1>
            <p className="text-slate-400 text-sm">
              {connected ? 'Taking you back to onboarding…' : 'Redirecting…'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
