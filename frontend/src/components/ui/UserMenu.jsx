import React, { useState } from 'react';
import { User, LogOut, Key, Cloud, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Card } from './Card';
import { cn } from '../../lib/utils';

export function UserMenu({ user, isGuest, onLogout, onGuestAuth, onChangePassword, onSync, onSettings }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <Button 
        variant="ghost" 
        size="icon" 
        className={cn(
          "rounded-xl transition-all duration-300",
          isGuest ? "bg-secondary/30" : "bg-primary/10 border border-primary/20"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isGuest ? <User size={20} className="text-muted-foreground" /> : <div className="font-bold text-primary">{user?.displayName?.charAt(0) || 'U'}</div>}
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <Card className="absolute right-0 mt-2 w-56 z-50 shadow-2xl border-primary/20 bg-background/95 backdrop-blur-md animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-white/5">
              <p className="text-xs font-bold text-primary uppercase tracking-widest">{isGuest ? 'Guest Mode' : 'Account'}</p>
              <p className="text-sm font-semibold truncate mt-1">{isGuest ? 'Browser Local' : user?.displayName}</p>
              {!isGuest && <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>}
            </div>
            
            <div className="p-2 space-y-1">
              {!isGuest && (
                <button 
                  onClick={() => { onChangePassword(); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg hover:bg-white/5 transition-colors"
                >
                  <Key size={14} className="text-muted-foreground" />
                  Change Password
                </button>
              )}
              
              {isGuest && (
                <button 
                  onClick={() => { onSync(); setIsOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-xs font-bold text-primary rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
                >
                  <RefreshCw size={14} />
                  Sync to Cloud
                </button>
              )}

              <button 
                onClick={() => { onSettings(); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg hover:bg-white/5 transition-colors"
              >
                <Cloud size={14} className="text-muted-foreground" />
                API Key Settings
              </button>
            </div>

            <div className="p-2 border-t border-white/5">
              <button 
                onClick={() => { (isGuest ? onGuestAuth : onLogout)(); setIsOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} />
                {isGuest ? 'Sign In / Sign Up' : 'Sign Out'}
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
