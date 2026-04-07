import React, { useState } from 'react';
import { useChromeStorage } from '@/hooks/useChromeStorage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { User, Plus, Trash2, Edit2, X, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ProfileManager() {
  const [profiles, setProfiles] = useChromeStorage('lazyfill_profiles', []);
  const [settings, setSettings] = useChromeStorage('lazyfill_settings', { activeProfileId: null });
  const [editingProfile, setEditingProfile] = useState(null);

  const activeProfileId = settings?.activeProfileId;

  const createProfile = () => {
    const newProfile = {
      id: crypto.randomUUID(),
      name: 'New Profile',
      fields: { 'First Name': '', 'Last Name': '', 'Email': '' }
    };
    setProfiles([...profiles, newProfile]);
    if (!activeProfileId) {
      setSettings({ ...settings, activeProfileId: newProfile.id });
    }
  };

  const deleteProfile = (id) => {
    setProfiles(profiles.filter(p => p.id !== id));
    if (activeProfileId === id) {
      setSettings({ ...settings, activeProfileId: profiles.find(p => p.id !== id)?.id || null });
    }
  };

  const setActive = (id) => {
    setSettings({ ...settings, activeProfileId: id });
  };

  if (editingProfile) {
    return (
      <ProfileEditor
        profile={editingProfile}
        onSave={(data) => {
          setProfiles(profiles.map(p => p.id === data.id ? data : p));
          setEditingProfile(null);
        }}
        onCancel={() => setEditingProfile(null)}
      />
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Profile List */}
      <div className="space-y-3">
        {profiles.map((p) => (
          <div
            key={p.id}
            onClick={() => setActive(p.id)}
            className={cn(
              "group relative p-1 rounded-[22px] transition-all",
              activeProfileId === p.id ? "bg-gradient-to-br from-primary to-primary/50 p-[2px]" : "bg-transparent"
            )}
          >
            <Card
              className={cn(
                "p-4 flex items-center justify-between border-white/5 bg-card/60 backdrop-blur-md rounded-[20px] cursor-pointer hover:bg-card/80 transition-colors",
              )}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary font-bold text-lg shadow-inner">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">{p.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {Object.keys(p.fields || {}).length} Fields
                    </p>
                    {activeProfileId === p.id && (
                      <span className="text-[10px] font-bold text-primary">• Active</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white/10" onClick={(e) => { e.stopPropagation(); setEditingProfile(p); }}>
                  <Edit2 size={16} className="text-muted-foreground" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-destructive/10 text-destructive" onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          </div>
        ))}
      </div>

      {/* Add New Profile Area */}
      <button
        onClick={createProfile}
        className="w-full py-4 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all group active:scale-95"
      >
        <Plus size={18} className="group-hover:scale-110 transition-transform" />
        <span className="text-sm font-bold tracking-wide">Add New Profile</span>
      </button>
    </div>
  );
}

function ProfileEditor({ profile, onSave, onCancel }) {
  const [name, setName] = useState(profile.name);
  // Separate UI state for fields to use stable IDs for React keys
  const [fields, setFields] = useState(() => 
    Object.entries(profile.fields || {}).map(([key, value]) => ({
      id: Math.random().toString(36).substring(2, 9),
      key,
      value
    }))
  );

  const addField = () => {
    // Prepend new field with stable ID
    setFields([{ id: Math.random().toString(36).substring(2, 9), key: '', value: '' }, ...fields]);
  };

  const removeField = (id) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const updateField = (id, updates) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleSave = () => {
    const fieldsObj = {};
    fields.forEach(f => {
      if (f.key.trim()) fieldsObj[f.key.trim()] = f.value;
    });
    onSave({ ...profile, name, fields: fieldsObj });
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-300 h-full flex flex-col bg-card/40 border border-white/5 rounded-[24px] p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold tracking-tight">Edit Profile</h2>
        <Button variant="secondary" size="icon" className="h-9 w-9 rounded-xl" onClick={onCancel}>
          <X size={20} />
        </Button>
      </div>

      <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest ml-1">Profile Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-secondary/20 border-white/5 h-12 text-base font-semibold focus:ring-primary/50"
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Profile Fields</label>
            <Button variant="secondary" size="sm" className="h-8 rounded-lg text-xs font-bold gap-1.5" onClick={addField}>
              <PlusCircle size={14} /> Add Field
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.id} className="flex gap-2 items-center group transition-colors">
                <div className="flex-1 flex gap-2">
                  <div className="flex-1 bg-secondary/30 rounded-xl border border-white/5 focus-within:border-primary/40 transition-all p-1">
                    <Input
                      placeholder="Label"
                      value={field.key}
                      className="h-8 text-[11px] bg-transparent border-0 focus-ring-0 px-2 font-bold focus:ring-0"
                      onChange={(e) => updateField(field.id, { key: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 bg-secondary/30 rounded-xl border border-white/5 focus-within:border-primary/40 transition-all p-1">
                    <Input
                      placeholder="Value"
                      value={field.value}
                      className="h-8 text-[11px] bg-transparent border-0 focus-ring-0 px-2 text-muted-foreground focus:ring-0"
                      onChange={(e) => updateField(field.id, { value: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-transparent transition-colors shrink-0 p-0"
                  onClick={() => removeField(field.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-6 mt-auto">
        <Button variant="outline" className="flex-1 h-12 rounded-2xl border-white/10 font-bold" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1 h-12 rounded-2xl font-bold" onClick={handleSave}>Save Changes</Button>
      </div>
    </div>
  );
}
