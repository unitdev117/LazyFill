import React, { useState, useEffect } from 'react';
import { useChromeStorage } from '@/hooks/useChromeStorage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Scan, Ghost, ChevronDown, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dashboard() {
  const [settings, setSettings] = useChromeStorage('lazyfill_settings', { activeProfileId: null, ghostPreviewEnabled: true });
  const activeProfileId = settings?.activeProfileId;
  const ghostPreviewMode = settings?.ghostPreviewEnabled ?? true;
  const setGhostPreviewMode = (val) => setSettings(prev => ({ ...prev, ghostPreviewEnabled: val }));
  
  const [profiles] = useChromeStorage('lazyfill_profiles', []);
  const [autoFillMode, setAutoFillMode] = useChromeStorage('lazyfill_autofill_mode', false);
  
  const [status, setStatus] = useState({ state: 'ready', message: 'Ready to scan' });
  const [stats, setStats] = useState({ found: 0, fillable: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const safeProfiles = Array.isArray(profiles) ? profiles.filter(Boolean) : [];
  const activeProfile = safeProfiles.find(p => p.id === activeProfileId);

  // Load field count from active tab
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id || !tab.url?.startsWith('http')) return;

        // Total fields found
        chrome.tabs.sendMessage(tab.id, { action: 'GET_FIELD_COUNT' }, (response) => {
          if (chrome.runtime.lastError) {
            // This usually happens after an extension update if the page isn't refreshed
            if (status.state !== 'error') {
               setStatus({ state: 'error', message: 'Page refresh required to sync' });
            }
            return;
          }
          if (response && response.success) {
            setStats(prev => ({ ...prev, found: response.count }));
            if (status.message === 'Page refresh required to sync') {
               setStatus({ state: 'ready', message: 'Ready to scan' });
            }
          }
        });

        // Instantly fillable fields (matched by profile)
        chrome.tabs.sendMessage(tab.id, { action: 'GET_GHOST_COUNT' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response && response.success) {
            setStats(prev => ({ ...prev, fillable: response.count }));
          }
        });

        // Trigger an autonomous check if counters are 0 to force background sync
        if (stats.found > 0 && stats.fillable === 0) {
           chrome.runtime.sendMessage({ action: 'REQUEST_AUTONOMOUS_GHOST', payload: { tabId: tab.id } });
        }

      } catch (err) {
        console.error('[LazyFill] Stats fetch failed:', err);
      }
    };

    fetchStats();
    // Refresh every 3 seconds while popup is open
    const interval = setInterval(fetchStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCompleteAutoFill = async () => {
    setIsProcessing(true);
    setStatus({ state: 'scanning', message: 'Analyzing page...' });

    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab) throw new Error('No active tab');

      // 1. Try Instant Commit (if ghost text is active)
      const commitRes = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'COMMIT_ALL_MAPPINGS' }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res);
        });
      });

      if (commitRes?.success && commitRes.committed > 0) {
        setStatus({ state: 'success', message: `Filled ${commitRes.committed} fields!` });
        setStats(prev => ({ ...prev, found: commitRes.committed }));
        return;
      }

      // 2. Fallback: Manual Scan-and-Fill
      const scanRes = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, { action: 'SCAN_PAGE' }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res);
        });
      });

      if (!scanRes?.success || scanRes.count === 0) {
        setStatus({ state: 'error', message: 'No fields found' });
        return;
      }

      setStatus({ state: 'scanning', message: 'Consulting AI...' });
      
      const aiRes = await new Promise(resolve => {
        chrome.runtime.sendMessage({ 
          action: 'PROCESS_SCAN_RESULTS', 
          payload: { scannedFields: scanRes.scannedFields } 
        }, resolve);
      });

      if (!aiRes?.success) throw new Error(aiRes?.error?.message || 'AI failure');

      setStatus({ state: 'scanning', message: 'Filling fields...' });

      const fillRes = await new Promise(resolve => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'FILL_FIELDS',
          payload: { mappings: aiRes.mappings, scannedFields: scanRes.scannedFields }
        }, (res) => {
          if (chrome.runtime.lastError) resolve({ success: false });
          else resolve(res);
        });
      });

      setStatus({ state: 'success', message: `Filled ${fillRes?.filled || 0} fields!` });
      setStats({ found: scanRes.count, fillable: fillRes?.filled || 0 });

    } catch (err) {
      console.error(err);
      // More user-friendly error if content script is missing
      if (err.message?.includes('Could not establish connection')) {
        setStatus({ state: 'error', message: 'Refresh the page to sync' });
      } else {
        setStatus({ state: 'error', message: err.message.split('.')[0] });
      }
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus(prev => prev.state === 'success' ? { state: 'ready', message: 'Ready to scan' } : prev), 3000);
    }
  };

  // Auto-select first profile if none active
  useEffect(() => {
    if (!activeProfileId && safeProfiles.length > 0) {
      const firstId = safeProfiles[0].id;
      setSettings(prev => ({ ...prev, activeProfileId: firstId }));
    }
  }, [activeProfileId, safeProfiles, setSettings]);

  const handleProfileChange = (e) => {
    const profileId = e.target.value;
    setSettings(prev => ({ ...prev, activeProfileId: profileId || null }));
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          {status.state === 'scanning' ? (
            <Loader2 size={16} className="text-primary animate-spin" />
          ) : status.state === 'error' ? (
            <AlertCircle size={16} className="text-destructive" />
          ) : (
            <div className={cn(
              "w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.5)] animate-pulse",
              status.state === 'success' ? "bg-emerald-500" : "bg-primary"
            )} />
          )}
          <span className="text-sm font-bold tracking-tight text-foreground/90">{status.message}</span>
        </div>
      </div>

      {/* Dual Stats Cards - Ultra Minimalist */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="h-20 p-3 bg-secondary/20 border-white/5 flex flex-col items-center justify-center space-y-0.5 hover:bg-secondary/40 transition-all cursor-default">
          <p className="text-2xl font-black tabular-nums font-outfit text-primary">{stats.found || '0'}</p>
          <p className="text-[8px] uppercase font-black text-muted-foreground tracking-widest">Found</p>
        </Card>
        <Card className="h-20 p-3 bg-secondary/20 border-white/5 flex flex-col items-center justify-center space-y-0.5 hover:bg-secondary/40 transition-all cursor-default">
          <p className="text-2xl font-black tabular-nums font-outfit text-emerald-500">{stats.fillable || '0'}</p>
          <p className="text-[8px] uppercase font-black text-muted-foreground tracking-widest">Fillable</p>
        </Card>
      </div>

      {/* Active Profile Section - Functional Select */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest ml-1">Active Profile</label>
        <div className="relative group">
          <select 
            value={activeProfileId || ''} 
            onChange={handleProfileChange}
            className="w-full appearance-none p-4 bg-secondary/40 border border-white/10 rounded-2xl text-sm font-bold hover:bg-secondary/60 transition-all hover:border-primary/40 active:scale-[0.99] outline-none cursor-pointer pr-10"
          >
            <option value="" disabled className="bg-card">Select Profile</option>
            {safeProfiles.map(p => (
              <option key={p.id} value={p.id} className="bg-card text-foreground">{p.name || 'Unnamed Profile'}</option>
            ))}
          </select>
          <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none group-hover:text-primary transition-colors" />
        </div>
      </div>

      {/* Main Action Button - Minimalist Redesign */}
      <div className="pt-2">
        <Button 
          onClick={handleCompleteAutoFill}
          disabled={isProcessing}
          className={cn(
            "w-full h-14 rounded-2xl border border-primary/20 shadow-xl transition-all active:scale-95 disabled:opacity-70 font-outfit font-black text-sm tracking-widest uppercase italic",
            status.state === 'success' ? "bg-emerald-600/20 text-emerald-500 border-emerald-500/30" : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              <span>Analyzing...</span>
            </div>
          ) : (
            'Complete Auto Fill'
          )}
        </Button>
      </div>

      {/* Toggles Group */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between p-4 px-5 bg-card/40 border border-white/5 rounded-[22px] group hover:border-white/10 transition-colors">
          <div className="space-y-0.5">
            <p className="text-sm font-bold tracking-tight">Auto-fill mode</p>
            <p className="text-[10px] text-muted-foreground font-medium">Fill immediately after scan</p>
          </div>
          <button 
            onClick={() => setAutoFillMode(!autoFillMode)}
            className={cn(
              "w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1",
              autoFillMode ? "bg-primary" : "bg-muted"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300",
              autoFillMode ? "translate-x-6" : "translate-x-0"
            )} />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 px-5 bg-card/40 border border-white/5 rounded-[22px] group hover:border-white/10 transition-colors">
          <div className="space-y-0.5">
            <p className="text-sm font-bold tracking-tight">Always-On Ghost Preview</p>
            <p className="text-[10px] text-muted-foreground font-medium">Autonomously scan and suggest inline</p>
          </div>
          <button 
            onClick={() => setGhostPreviewMode(!ghostPreviewMode)}
            className={cn(
              "w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1",
              ghostPreviewMode ? "bg-primary" : "bg-muted"
            )}
          >
            <div className={cn(
              "w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300",
              ghostPreviewMode ? "translate-x-6" : "translate-x-0"
            )} />
          </button>
        </div>
      </div>
    </div>
  );
}
