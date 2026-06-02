import React, { useEffect, useState } from 'react';
import { useChromeStorage } from '@/hooks/useChromeStorage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Ban, Plus, Trash2, Globe, ShieldOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeHost, hostCoveredBy, parseDomainInput } from '@/shared/domain';

/**
 * "Disabled" section — fully user-driven blocklist.
 *
 * The user adds a website (the current tab is pre-filled, but the field is
 * editable and accepts any domain they type). LazyFill then stays off across
 * the COMPLETE website — every page and subdomain — not just one page.
 * Nothing about which sites to block is hardcoded; scope is the user's choice.
 */
export function DisabledSites() {
  const [disabledSites, setDisabledSites] = useChromeStorage('lazyfill_disabled_sites', []);
  const [currentHost, setCurrentHost] = useState('');
  const [currentTabId, setCurrentTabId] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const list = Array.isArray(disabledSites) ? disabledSites.filter(Boolean) : [];

  // Pre-fill the field with the current tab's host.
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return;
      try {
        const host = normalizeHost(new URL(tab.url).hostname);
        setCurrentHost(host);
        setCurrentTabId(tab.id ?? null);
        setInputValue((prev) => prev || host);
      } catch (_) {
        /* not a normal web page */
      }
    });
  }, []);

  const isCurrentCovered = currentHost && list.some((entry) => hostCoveredBy(currentHost, entry));

  const addSite = () => {
    const parsed = parseDomainInput(inputValue);
    if (!parsed) {
      setError('Enter a valid domain, e.g. example.com');
      return;
    }
    if (list.includes(parsed) || list.some((entry) => hostCoveredBy(parsed, entry))) {
      setError(`${parsed} is already disabled`);
      return;
    }

    setDisabledSites([...list, parsed]);
    setError('');
    setInputValue('');

    // If we just disabled the site in the active tab, clear any live suggestions.
    if (currentTabId != null && hostCoveredBy(currentHost, parsed)) {
      chrome.tabs.sendMessage(currentTabId, { action: 'CLEAR_GHOST_TEXT' }, () => {
        void chrome.runtime.lastError; // ignore "no receiver"
      });
    }
  };

  const removeSite = (host) => setDisabledSites(list.filter((h) => h !== host));

  const onKeyDown = (e) => {
    if (e.key === 'Enter') addSite();
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Heading */}
      <div className="flex items-center gap-3 px-1">
        <div className="w-9 h-9 rounded-xl bg-secondary/40 text-foreground/80 flex items-center justify-center shrink-0">
          <ShieldOff size={18} />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-black tracking-tight">Disabled Sites</p>
          <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
            LazyFill never runs on these websites — the whole site, every page.
          </p>
        </div>
      </div>

      {/* Add a site (editable — current tab pre-filled, or type any domain) */}
      <div className="space-y-2">
        {isCurrentCovered && (
          <div className="flex items-center gap-2 px-1">
            <Ban size={13} className="text-primary shrink-0" />
            <p className="text-[11px] font-bold text-primary/90 truncate">
              This site (<span className="text-foreground/80">{currentHost}</span>) is disabled
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setError(''); }}
            onKeyDown={onKeyDown}
            placeholder="example.com"
            spellCheck={false}
            className="flex-1 h-11"
          />
          <Button
            onClick={addSite}
            disabled={!inputValue.trim()}
            className="h-11 px-4 rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 font-bold text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50"
          >
            <Plus size={16} />
            Add
          </Button>
        </div>

        {error ? (
          <p className="text-[11px] text-destructive font-medium ml-1">{error}</p>
        ) : (
          <p className="text-[10px] text-muted-foreground font-medium ml-1">
            Blocks the whole site — all pages and subdomains.
          </p>
        )}
      </div>

      {/* The list of disabled sites */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase font-black text-muted-foreground tracking-widest ml-1">
          Blocked list ({list.length})
        </label>

        {list.length === 0 ? (
          <Card className="p-6 bg-secondary/10 border-white/5 flex flex-col items-center justify-center gap-2 text-center">
            <Globe size={22} className="text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground font-medium">No sites disabled yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {list.map((host) => (
              <div
                key={host}
                className={cn(
                  'flex items-center justify-between gap-2 p-3 px-4 rounded-2xl border transition-colors',
                  hostCoveredBy(currentHost, host)
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-card/40 border-white/5 hover:border-white/10'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe size={15} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-bold tracking-tight truncate">{host}</span>
                </div>
                <button
                  onClick={() => removeSite(host)}
                  aria-label={`Remove ${host}`}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DisabledSites;
