import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ArrowLeft, X } from 'lucide-react';

export function AuthContainer({
  initialView = 'welcome',
  onLoginSuccess,
  onSignUpSuccess,
  onSkip,
  onClose,
  showSkip = true,
}) {
  const [view, setView] = useState(initialView);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setView(initialView);
    setError('');
  }, [initialView]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (view === 'signup' && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      if (view === 'login') {
        await onLoginSuccess(formData);
      } else {
        await onSignUpSuccess(formData);
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (view === 'welcome') {
    return (
      <Card className="w-full max-w-sm mx-auto shadow-2xl border-white/10 bg-card/90 backdrop-blur-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-2xl font-bold">Sign in</CardTitle>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Sync your profiles, API key, and settings across browsers and devices.
              </p>
            </div>
            {onClose && (
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onClose}>
                <X size={18} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full h-12 font-bold" onClick={() => setView('login')}>
            Sign In
          </Button>
          <div className="rounded-2xl border border-white/5 bg-secondary/20 px-4 py-3 text-center text-sm text-muted-foreground">
            New user?{' '}
            <button className="font-bold text-primary hover:underline" onClick={() => setView('signup')}>
              Want to sign up
            </button>
          </div>
        </CardContent>
        {showSkip && (
          <CardFooter className="pt-0">
            <Button variant="ghost" className="w-full text-sm font-semibold" onClick={onSkip}>
              Skip
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto shadow-2xl transition-all duration-300 border-white/10 bg-card/90 backdrop-blur-md">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl"
            onClick={() => {
              setError('');
              setView('welcome');
            }}
          >
            <ArrowLeft size={18} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl" onClick={onClose}>
              <X size={18} />
            </Button>
          )}
        </div>
        <CardTitle className="text-2xl font-bold text-center">
          {view === 'login' ? 'Welcome Back' : 'Create Account'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold ml-1">Email</label>
            <Input
              type="email"
              name="email"
              placeholder="name@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold ml-1">Password</label>
            <Input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          {view === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold ml-1">Confirm Password</label>
              <Input
                type="password"
                name="confirmPassword"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium animate-pulse">{error}</p>}

          <Button type="submit" className="w-full mt-2" disabled={isLoading}>
            {isLoading ? 'Processing...' : view === 'login' ? 'Sign In' : 'Sign Up'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 pt-0">
        <div className="text-xs text-center text-muted-foreground">
          {view === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setView(view === 'login' ? 'signup' : 'login')}
            className="text-primary font-bold hover:underline"
          >
            {view === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
        {showSkip && (
          <>
            <div className="w-full border-t border-border/50 my-2" />
            <Button variant="ghost" className="w-full text-xs opacity-60" onClick={onSkip}>
              Skip
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
