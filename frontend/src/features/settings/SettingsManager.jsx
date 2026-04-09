import React from 'react';
import { useChromeStorage } from '@/hooks/useChromeStorage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { Lock, Save, Trash2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';


export default function SettingsManager() {
  const [apiKey, setApiKey] = useChromeStorage('lazyfill_api_key', '');
  const [draftApiKey, setDraftApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);

  React.useEffect(() => {
    setDraftApiKey(apiKey || '');
  }, [apiKey]);

  const handleSave = () => {
    setApiKey(draftApiKey.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const deleteKey = () => {
    setDraftApiKey('');
    setApiKey('');
    setIsSaved(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <Card className="bg-card/40 border-white/5 overflow-visible pt-10 pb-4">
        <CardContent className="flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 rounded-[24px] bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xl relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Lock size={32} className="relative z-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">Google AI API Key</h2>
            <p className="text-[11px] text-muted-foreground px-6 leading-relaxed font-bold">
              Your key is stored locally and never sent to any server except the API engine.
            </p>
          </div>

          {/* Key Input */}
          <div className="w-full relative px-4">
            <Input 
              type={showKey ? "text" : "password"} 
              placeholder="••••••••••••••••••••••••••••" 
              value={draftApiKey}
              onChange={(e) => setDraftApiKey(e.target.value)}
              className="bg-secondary/20 border-white/5 h-12 pr-12 font-mono text-xs tracking-[0.2em] text-center focus:border-primary/50 rounded-xl"
            />
            <button 
              onClick={() => setShowKey(!showKey)}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors"
            >
              {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Actions */}
          <div className="w-full grid grid-cols-2 gap-4 px-4">
            <Button 
              onClick={handleSave}
              className={cn(
                "h-12 rounded-[18px] font-black gap-2 transition-all duration-300 border-0",
                isSaved ? "bg-emerald-600 shadow-emerald-500/20" : "bg-primary hover:bg-primary/90 shadow-primary/20"
              )}
            >
              {isSaved ? <CheckCircle2 size={18} /> : <Save size={18} />}
              {isSaved ? "Saved!" : "Save Key"}
            </Button>
            <Button variant="outline" className="h-12 rounded-[18px] font-black gap-2 bg-destructive/5 border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all" onClick={deleteKey}>
              <Trash2 size={18} /> Delete Key
            </Button>
          </div>

          {/* Status Badge - Refined to match green/configured style */}
          {apiKey && (
            <div className={cn(
              "w-[calc(100%-2rem)] mx-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center gap-2 text-emerald-500 font-black text-xs uppercase tracking-widest transition-all duration-500",
              isSaved ? "scale-105 bg-emerald-500/20 border-emerald-500/40" : "opacity-90"
            )}>
              <CheckCircle2 size={16} className={cn(isSaved && "animate-bounce")} />
              API key is configured
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
