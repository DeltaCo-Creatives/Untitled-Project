import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, FolderHeart, Activity, Settings, Loader2, PlugZap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type ActivityEntry, type MeResponse } from '../lib/api';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchBusy, setWatchBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meRes, activityRes] = await Promise.all([api.me(), api.activity(20)]);
      setMe(meRes);
      setActivity(activityRes.activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleWatch = async () => {
    if (!me) return;
    setWatchBusy(true);
    try {
      if (me.watching) {
        await api.stopWatch();
      } else {
        await api.startWatch();
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update watch status');
    } finally {
      setWatchBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

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

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!me?.driveConnected || !me?.config ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <PlugZap className="text-indigo-400 w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Finish setting up DriveTag</h3>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              {me?.driveConnected
                ? 'Google Drive is connected — pick your Raw and Destination folders to start.'
                : "Connect your Google Drive so we can start watching your folder."}
            </p>
            <button
              onClick={() => navigate('/onboarding')}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Continue Setup
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Status Card */}
            <div className="col-span-1 md:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">Active Watch</h3>
                  <p className="text-sm text-slate-400">
                    {me.watching ? 'Your Drive is being monitored automatically.' : 'Watch is currently paused.'}
                  </p>
                </div>
                <button
                  onClick={handleToggleWatch}
                  disabled={watchBusy}
                  className={`px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                    me.watching
                      ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${me.watching ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                  {watchBusy ? 'Updating…' : me.watching ? 'Monitoring' : 'Paused — click to start'}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Watching</span>
                  <span className="text-slate-200">{me.config.rawFolderName}</span>
                </div>
                <div className="flex items-center justify-center px-2 text-slate-600 hidden sm:flex">→</div>
                <div className="flex-1 bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Destination</span>
                  <span className="text-slate-200">{me.config.destinationFolderName}</span>
                </div>
              </div>
            </div>

            {/* Activity Card */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col">
              <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                Activity
              </h3>
              {activity.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-6">
                  <span className="text-4xl font-extrabold text-white">0</span>
                  <span className="text-sm text-slate-400 mt-1">Files Processed Yet</span>
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto max-h-48 divide-y divide-slate-800/60 -mx-1">
                  {activity.map((entry) => (
                    <li key={entry.id} className="px-1 py-2 text-xs text-slate-300 truncate">
                      {entry.new_name ?? entry.original_name ?? entry.file_id}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Subscription Area */}
        {me?.subscription && (
          <div className="mt-8 bg-slate-900/40 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Subscription</h3>
              <p className="text-sm text-slate-400">
                {me.subscription.status === 'trialing'
                  ? `You're on a trial — ends ${
                      me.subscription.trialEndsAt ? new Date(me.subscription.trialEndsAt).toLocaleDateString() : 'soon'
                    }.`
                  : `Plan: ${me.subscription.plan} (${me.subscription.status}).`}
              </p>
            </div>
            <button className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors w-full sm:w-auto flex items-center justify-center gap-2">
              <Settings className="w-4 h-4" />
              Manage Billing
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
