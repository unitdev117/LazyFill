import React, { useState } from 'react';
import ProfileManager from '@/features/profiles/ProfileManager';
import SettingsManager from '@/features/settings/SettingsManager';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { Button } from '@/components/ui/Button';
import { Layout, User, Settings, Shield, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout, component: Dashboard },
    { id: 'profiles', label: 'Profiles', icon: User, component: ProfileManager },
    { id: 'settings', label: 'API Key', icon: Shield, component: SettingsManager },
  ];

  const ActiveComponent = navItems.find(i => i.id === activeTab)?.component || Dashboard;

  return (
    <div className="w-[450px] h-[590px] flex flex-col bg-background text-foreground overflow-hidden font-outfit">
      {/* Header */}
      <header className="p-5 flex items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-primary/20 border border-white/10">
            <img 
              src={chrome.runtime.getURL('frontend/dist/assets/icon48.png')} 
              className="w-full h-full object-cover" 
              alt="LazyFill Logo" 
            />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-wide leading-none">LazyFill</h1>
            <p className="text-[10px] text-muted-foreground mt-1 tracking-tight">AI-Powered Autofill</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="rounded-xl bg-secondary/30" onClick={() => setActiveTab('settings')}>
          <Settings size={20} />
        </Button>
      </header>

      {/* Top Navigation */}
      <nav className="px-5 py-2 flex items-center gap-2 border-b border-white/5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 pr-2 px-3 rounded-lg transition-all text-xs font-semibold",
              activeTab === item.id 
                ? "text-primary bg-primary/10 border-b-2 border-primary rounded-b-none" 
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            )}
          >
            <item.icon size={16} />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        <ActiveComponent />
      </main>

    </div>
  );
}
