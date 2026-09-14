import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { HardDrive } from 'lucide-react';

export default function Login() {
  const { user, signInWithGoogle } = useAuth();

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] bg-indigo-900/30 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-fuchsia-900/20 blur-[120px] rounded-full mix-blend-screen pointer-events-none" />
      
      <div className="relative z-10 max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-slate-800/60 p-8 sm:p-12 rounded-3xl shadow-2xl flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30 mb-8">
          <HardDrive className="text-white w-8 h-8" />
        </div>
        
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 mb-4">
          DriveTag AI
        </h1>
        
        <p className="text-slate-400 mb-10 text-sm leading-relaxed">
          The invisible AI assistant that magically organizes your Google Drive assets in the background.
        </p>

        <button 
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white text-slate-900 font-semibold rounded-xl hover:bg-slate-100 transition-all active:scale-[0.98] shadow-lg hover:shadow-xl"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="mt-6 text-xs text-slate-500">
          Secure, Zero-Retention. We never store your files.
        </p>
      </div>
    </div>
  );
}
