import React, { useEffect, useState } from 'react';
import ProfileManager from '@/features/profiles/ProfileManager';
import SettingsManager from '@/features/settings/SettingsManager';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { Button } from '@/components/ui/Button';
import { UserMenu } from '@/components/ui/UserMenu';
import { AuthContainer } from '@/components/auth/AuthContainer';
import { MessageCard } from '@/components/auth/MessageCard';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useChromeStorage } from '@/hooks/useChromeStorage';
import { CONFIG } from '@/lib/config';
import { Layout, User, Settings, Shield, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

import icon48 from '@/assets/icon48.png';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, , isUserLoaded] = useChromeStorage(CONFIG.STORAGE_KEYS.USER_DATA, null);
  const [onboardingDone, setOnboardingDone, isOnboardingLoaded] = useChromeStorage(CONFIG.STORAGE_KEYS.ONBOARDING_DONE, false);
  const [panel, setPanel] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);

  const isGuest = !currentUser;
  const isReady = isUserLoaded && isOnboardingLoaded;
  const shouldShowOnboarding = isReady && !onboardingDone && !currentUser;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Layout, component: Dashboard },
    { id: 'profiles', label: 'Profiles', icon: User, component: ProfileManager },
    { id: 'settings', label: 'API Key', icon: Shield, component: SettingsManager },
  ];

  const ActiveComponent = navItems.find(i => i.id === activeTab)?.component || Dashboard;

  useEffect(() => {
    if (currentUser && !onboardingDone) {
      setOnboardingDone(true);
    }
  }, [currentUser, onboardingDone, setOnboardingDone]);

  const sendMessage = (action, payload = {}) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          const message =
            response?.error?.message ||
            response?.error ||
            'Request failed';
          reject(new Error(message));
          return;
        }
        resolve(response);
      });
    });

  const handleLogin = async ({ email, password }) => {
    await sendMessage('AUTH_LOGIN', { email, password });
    setOnboardingDone(true);
    setPanel(null);
    setActiveTab('dashboard');
  };

  const handleSignUp = async ({ email, password }) => {
    await sendMessage('AUTH_SIGNUP', { email, password });
    setOnboardingDone(true);
    setActiveTab('profiles');
    setPanel({ type: 'message', kind: 'signup' });
  };

  const handleLogout = async () => {
    await sendMessage('AUTH_LOGOUT');
    setPanel(null);
    setActiveTab('dashboard');
  };

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordError('');
    setIsPasswordLoading(true);
    try {
      await sendMessage('AUTH_CHANGE_PASSWORD', {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPanel({ type: 'message', kind: 'passwordChanged' });
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const renderMessagePanel = (kind) => {
    if (kind === 'skip') {
      return (
        <MessageCard
          title="Why sign in?"
          message="Signing in keeps your profiles, API key, and settings synced across browsers and devices."
          details={[
            'If you skip, everything stays only in this browser and only on this machine.',
          ]}
          actionText="Proceed"
          onAction={() => {
            setOnboardingDone(true);
            setPanel(null);
            setActiveTab('profiles');
          }}
          secondaryActionText="Back"
          onSecondaryAction={() => setPanel(null)}
        />
      );
    }

    if (kind === 'passwordChanged') {
      return (
        <MessageCard
          title="Password changed"
          message="Your password has been updated and older sessions are no longer valid."
          details={[
            'Sign in again on this device to continue using cloud sync.',
          ]}
          actionText="Sign In Again"
          onAction={() => setPanel({ type: 'auth', initialView: 'login', showSkip: false })}
        />
      );
    }

    return (
      <MessageCard
        title="Set up your profile and API key"
        message="Your account is ready. Add a profile and your API key before using LazyFill."
        details={[
          'Profiles store the values LazyFill uses for form autofill.',
          'Your API key powers the AI matching that maps profile data to fields.',
        ]}
        actionText="Proceed"
        onAction={() => setPanel(null)}
      />
    );
  };

  if (!isReady) {
    return <div className="w-[450px] h-[590px] bg-background" />;
  }

  if (shouldShowOnboarding || panel?.type === 'message') {
    const messageKind = panel?.kind || null;
    return (
      <div className="w-[450px] h-[590px] flex flex-col bg-background text-foreground overflow-hidden font-outfit pt-0">
        <header className="px-5 pt-1 pb-1 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-primary/20 border border-white/10">
            <img src={icon48} className="w-full h-full object-cover" alt="LazyFill Logo" />
          </div>
          <div className="h-10 py-[1px] flex flex-col justify-between">
            <h1 className="font-bold text-xl tracking-wide leading-none">LazyFill</h1>
            <p className="text-[10px] leading-none text-muted-foreground tracking-tight">AI-Powered Autofill</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5 custom-scrollbar flex items-center">
          {messageKind ? (
            renderMessagePanel(messageKind)
          ) : (
            <AuthContainer
              initialView="welcome"
              onLoginSuccess={handleLogin}
              onSignUpSuccess={handleSignUp}
              onSkip={() => setPanel({ type: 'message', kind: 'skip' })}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="w-[450px] h-[590px] flex flex-col bg-background text-foreground overflow-hidden font-outfit relative pt-0">
      {/* Header */}
      <header className="px-5 pt-1 pb-1 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-primary/20 border border-white/10">
            <img 
              src={icon48} 
              className="w-full h-full object-cover" 
              alt="LazyFill Logo" 
            />
          </div>
          <div className="h-10 py-[1px] flex flex-col justify-between">
            <h1 className="font-bold text-xl tracking-wide leading-none">LazyFill</h1>
            <p className="text-[10px] leading-none text-muted-foreground tracking-tight">AI-Powered Autofill</p>
          </div>
        </div>
        <UserMenu 
          user={currentUser}
          isGuest={isGuest}
          onLogout={handleLogout}
          onGuestAuth={() => setPanel({ type: 'auth', initialView: 'welcome', showSkip: false })}
          onChangePassword={() => setPanel({ type: 'changePassword' })}
          onSync={() => setPanel({ type: 'auth', initialView: 'login', showSkip: false })}
          onSettings={() => setActiveTab('settings')}
        />
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

      {panel && panel.type !== 'message' && (
        <div className="absolute inset-0 z-50 bg-background/85 backdrop-blur-sm p-5 flex items-center">
          {panel.type === 'auth' ? (
            <AuthContainer
              initialView={panel.initialView}
              showSkip={panel.showSkip}
              onLoginSuccess={handleLogin}
              onSignUpSuccess={handleSignUp}
              onSkip={() => setPanel({ type: 'message', kind: 'skip' })}
              onClose={() => setPanel(null)}
            />
          ) : (
            <Card className="w-full max-w-sm mx-auto shadow-2xl border-white/10 bg-card/90 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-center">Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold ml-1">Current Password</label>
                  <Input
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(event) => {
                      setPasswordForm((prev) => ({ ...prev, oldPassword: event.target.value }));
                      setPasswordError('');
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold ml-1">New Password</label>
                  <Input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => {
                      setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }));
                      setPasswordError('');
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold ml-1">Confirm New Password</label>
                  <Input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => {
                      setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }));
                      setPasswordError('');
                    }}
                  />
                </div>
                {passwordError && <p className="text-xs text-red-500 font-medium">{passwordError}</p>}
              </CardContent>
              <CardFooter className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setPanel(null)}>
                  Cancel
                </Button>
                <Button className="flex-1" disabled={isPasswordLoading} onClick={handleChangePassword}>
                  {isPasswordLoading ? 'Updating...' : 'Update'}
                </Button>
              </CardFooter>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
