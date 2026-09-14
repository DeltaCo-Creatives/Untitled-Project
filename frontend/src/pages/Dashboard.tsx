import { useAuth } from '../contexts/AuthContext';
import { LogOut, FolderHeart, Activity, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <FolderHeart className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">DriveTag AI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400 hidden sm:inline-block">{user?.email}</span>
            <button 
              onClick={signOut}
              className="text-slate-400 hover:text-white p-2 rounded-md hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <Link to="/onboarding" className="text-sm text-indigo-400 hover:text-indigo-300">
            Reconfigure Folders
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Status Card */}
          <div className="col-span-1 md:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white">Active Watch</h3>
                <p className="text-sm text-slate-400">Your Drive is being monitored automatically.</p>
              </div>
              <span className="px-3 py-1 bg-green-500/10 text-green-400 text-xs font-medium rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                Monitoring
              </span>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Watching</span>
                <span className="text-slate-200">My Raw Assets</span>
              </div>
              <div className="flex items-center justify-center px-2 text-slate-600 hidden sm:flex">
                →
              </div>
              <div className="flex-1 bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Destination</span>
                <span className="text-slate-200">Sorted Assets</span>
              </div>
            </div>
          </div>

          {/* Mini Stats Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              Activity
            </h3>
            <div className="flex-1 flex flex-col items-center justify-center py-6">
              <span className="text-4xl font-extrabold text-white">14</span>
              <span className="text-sm text-slate-400 mt-1">Files Processed Today</span>
            </div>
          </div>
        </div>

        {/* Subscription Area */}
        <div className="mt-8 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Subscription</h3>
            <p className="text-sm text-slate-400">You are currently on the Free Tier (100 files/mo).</p>
          </div>
          <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors w-full sm:w-auto flex items-center justify-center gap-2">
            <Settings className="w-4 h-4" />
            Manage Billing
          </button>
        </div>
      </main>
    </div>
  );
}
