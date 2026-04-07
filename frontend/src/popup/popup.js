/**
 * ============================================================
 *  POPUP.JS — Dashboard Controller
 * ============================================================
 *  Handles all popup UI interactions and communicates
 *  exclusively via chrome.runtime.sendMessage to the Backend.
 * ============================================================
 */

(function () {
  'use strict';

  /* --------------------------------------------------
   *  MESSAGING HELPER
   * -------------------------------------------------- */

  function sendMessage(action, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  function sendToTab(tabId, message) {
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /* --------------------------------------------------
   *  DOM REFERENCES
   * -------------------------------------------------- */

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Tabs
  const navTabs = $('#navTabs');
  const tabBtns = $$('.tab');
  const tabPanels = $$('.tab-panel');

  // Dashboard
  const statusCard = $('#statusCard');
  const statusText = $('#statusText');
  const activeProfileSelect = $('#activeProfileSelect');
  // UI Elements
  const btnScan = document.getElementById('btnScan');
  const autoFillToggle = document.getElementById('autoFillToggle');
  const fieldCounter = document.getElementById('fieldCounter');
  const toastContainer = $('#toastContainer');

  // Profiles
  const profileList = $('#profileList');
  const btnAddProfile = $('#btnAddProfile');
  const profileEditor = $('#profileEditor');
  const editorTitle = $('#editorTitle');
  const profileNameInput = $('#profileNameInput');
  const fieldsList = $('#fieldsList');
  const btnAddField = $('#btnAddField');
  const btnCloseEditor = $('#btnCloseEditor');
  const btnCancelProfile = $('#btnCancelProfile');
  const btnSaveProfile = $('#btnSaveProfile');

  // Settings
  const apiKeyInput = $('#apiKeyInput');
  const toggleKeyVisibility = $('#toggleKeyVisibility');
  const btnSaveKey = $('#btnSaveKey');
  const btnDeleteKey = $('#btnDeleteKey');
  const keyStatus = $('#keyStatus');

  // Settings toggle in header
  const settingsToggle = $('#settingsToggle');

  /* --------------------------------------------------
   *  STATE
   * -------------------------------------------------- */

  let currentEditingProfileId = null;
  let lastScannedFields = null;
  let lastMappings = null;

  /* --------------------------------------------------
   *  TOAST NOTIFICATIONS
   * -------------------------------------------------- */

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /* --------------------------------------------------
   *  TAB NAVIGATION
   * -------------------------------------------------- */

  navTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;

    const targetTab = btn.dataset.tab;
    tabBtns.forEach((t) => t.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#panel-${targetTab}`).classList.add('active');
  });

  // Settings gear button → switch to settings tab
  settingsToggle.addEventListener('click', () => {
    tabBtns.forEach((t) => t.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    $$('.tab')[2].classList.add('active');
    $('#panel-settings').classList.add('active');
  });

  /* --------------------------------------------------
   *  INITIALIZE
   * -------------------------------------------------- */

  async function init() {
    await loadApiKeyStatus();
    await loadProfiles();
    await loadSettings();
    await loadLiveFieldCount();
  }

  async function loadLiveFieldCount() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const res = await sendToTab(tab.id, { action: 'GET_FIELD_COUNT' });
      if (res && res.success) {
        fieldCounter.textContent = res.count > 0 
          ? `${res.count} fillable fields detected` 
          : 'No fillable fields detected on this page.';
        
        if (res.count === 0) {
          btnScan.disabled = true;
        }
      }
    } catch (e) {
      // Content script might not be injected
      fieldCounter.textContent = 'Ready to scan.';
    }
  }

  /* --------------------------------------------------
   *  API KEY MANAGEMENT
   * -------------------------------------------------- */

  async function loadApiKeyStatus() {
    try {
      const res = await sendMessage('GET_API_KEY');
      if (res?.apiKey) {
        keyStatus.className = 'key-status configured';
        keyStatus.textContent = '✓ API key is configured';
        apiKeyInput.placeholder = '••••••••••••••••';
      } else {
        keyStatus.className = 'key-status not-configured';
        keyStatus.textContent = '⚠ No API key configured';
      }
    } catch (err) {
      keyStatus.className = 'key-status not-configured';
      keyStatus.textContent = '⚠ Could not check key status';
    }
  }

  btnSaveKey.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showToast('Please enter an API key.', 'error');
      return;
    }
    try {
      const res = await sendMessage('SAVE_API_KEY', { apiKey: key });
      if (res?.success) {
        showToast('API key saved securely.', 'success');
        apiKeyInput.value = '';
        await loadApiKeyStatus();
      } else {
        showToast(res?.error?.message || 'Failed to save key.', 'error');
      }
    } catch (err) {
      showToast('Error saving key: ' + err.message, 'error');
    }
  });

  btnDeleteKey.addEventListener('click', async () => {
    try {
      await sendMessage('DELETE_API_KEY');
      showToast('API key deleted.', 'info');
      await loadApiKeyStatus();
    } catch (err) {
      showToast('Error deleting key.', 'error');
    }
  });

  toggleKeyVisibility.addEventListener('click', () => {
    const type = apiKeyInput.type === 'password' ? 'text' : 'password';
    apiKeyInput.type = type;
  });

  /* --------------------------------------------------
   *  PROFILE MANAGEMENT
   * -------------------------------------------------- */

  async function loadProfiles() {
    try {
      const res = await sendMessage('GET_ALL_PROFILES');
      const profiles = res?.profiles || [];
      const settingsRes = await sendMessage('GET_SETTINGS');
      const activeId = settingsRes?.settings?.activeProfileId;

      renderProfileList(profiles, activeId);
      renderProfileSelect(profiles, activeId);
    } catch (err) {
      showToast('Failed to load profiles.', 'error');
    }
  }

  function renderProfileList(profiles, activeId) {
    if (profiles.length === 0) {
      profileList.innerHTML = `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <p>No profiles yet. Create one to get started!</p>
        </div>`;
      return;
    }

    profileList.innerHTML = profiles
      .map((p) => {
        const fieldsCount = Object.keys(p.fields || {}).length;
        const initials = p.name.slice(0, 2).toUpperCase();
        const isActive = p.id === activeId;
        return `
          <div class="profile-card ${isActive ? 'active' : ''}" data-id="${p.id}">
            <div class="profile-info">
              <div class="profile-avatar">${initials}</div>
              <div>
                <div class="profile-name">${escapeHtml(p.name)}</div>
                <div class="profile-fields-count">${fieldsCount} field${fieldsCount !== 1 ? 's' : ''}${isActive ? ' · Active' : ''}</div>
              </div>
            </div>
            <div class="profile-actions">
              <button class="icon-btn btn-edit-profile" data-id="${p.id}" title="Edit">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="icon-btn btn-delete-profile" data-id="${p.id}" title="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>`;
      })
      .join('');
  }

  function renderProfileSelect(profiles, activeId) {
    activeProfileSelect.innerHTML = '<option value="">— Select a Profile —</option>';
    profiles.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === activeId) opt.selected = true;
      activeProfileSelect.appendChild(opt);
    });
  }

  // Profile card click → set active
  profileList.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-profile');
    const deleteBtn = e.target.closest('.btn-delete-profile');
    const card = e.target.closest('.profile-card');

    if (editBtn) {
      e.stopPropagation();
      await openEditor(editBtn.dataset.id);
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      await deleteProfile(deleteBtn.dataset.id);
      return;
    }

    if (card) {
      await setActiveProfile(card.dataset.id);
    }
  });

  activeProfileSelect.addEventListener('change', async () => {
    await setActiveProfile(activeProfileSelect.value);
  });

  async function setActiveProfile(profileId) {
    try {
      await sendMessage('SET_ACTIVE_PROFILE', { profileId: profileId || null });
      showToast(profileId ? 'Profile activated.' : 'Profile deselected.', 'success');
      await loadProfiles();
    } catch (err) {
      showToast('Failed to set active profile.', 'error');
    }
  }

  async function deleteProfile(profileId) {
    try {
      await sendMessage('DELETE_PROFILE', { profileId });
      showToast('Profile deleted.', 'info');
      await loadProfiles();
    } catch (err) {
      showToast('Failed to delete profile.', 'error');
    }
  }

  /* --------------------------------------------------
   *  PROFILE EDITOR
   * -------------------------------------------------- */

  btnAddProfile.addEventListener('click', () => openEditor(null));
  btnCloseEditor.addEventListener('click', closeEditor);
  btnCancelProfile.addEventListener('click', closeEditor);

  async function openEditor(profileId) {
    currentEditingProfileId = profileId;
    profileEditor.classList.remove('hidden');

    if (profileId) {
      editorTitle.textContent = 'Edit Profile';
      const res = await sendMessage('GET_PROFILE', { profileId });
      if (res?.profile) {
        profileNameInput.value = res.profile.name;
        renderFieldEditor(res.profile.fields || {});
      }
    } else {
      editorTitle.textContent = 'New Profile';
      profileNameInput.value = '';
      renderFieldEditor({});
      addFieldRow();  // start with one empty row
    }
  }

  function closeEditor() {
    profileEditor.classList.add('hidden');
    currentEditingProfileId = null;
  }

  function renderFieldEditor(fields) {
    fieldsList.innerHTML = '';
    Object.entries(fields).forEach(([key, value]) => addFieldRow(key, value));
  }

  function addFieldRow(key = '', value = '', prepend = false) {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `
      <input type="text" class="form-input field-key" placeholder="Field name" value="${escapeHtml(key)}">
      <input type="text" class="form-input field-value" placeholder="Value" value="${escapeHtml(value)}">
      <button class="icon-btn btn-remove-field" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`;
    
    if (prepend) {
      fieldsList.prepend(row);
      // Auto-focus the key input for better UX when adding new fields
      const keyInput = row.querySelector('.field-key');
      if (keyInput) setTimeout(() => keyInput.focus(), 50);
    } else {
      fieldsList.appendChild(row);
    }
  }

  btnAddField.addEventListener('click', () => addFieldRow('', '', true));

  fieldsList.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.btn-remove-field');
    if (removeBtn) removeBtn.closest('.field-row').remove();
  });

  btnSaveProfile.addEventListener('click', async () => {
    const name = profileNameInput.value.trim();
    if (!name) {
      showToast('Profile name is required.', 'error');
      return;
    }

    const fields = {};
    fieldsList.querySelectorAll('.field-row').forEach((row) => {
      const key = row.querySelector('.field-key').value.trim();
      const value = row.querySelector('.field-value').value.trim();
      if (key) fields[key] = value;
    });

    try {
      if (currentEditingProfileId) {
        await sendMessage('UPDATE_PROFILE', {
          profileId: currentEditingProfileId,
          updates: { name, fields },
        });
        showToast('Profile updated.', 'success');
      } else {
        await sendMessage('CREATE_PROFILE', { name, fields });
        showToast('Profile created!', 'success');
      }
      closeEditor();
      await loadProfiles();
    } catch (err) {
      showToast('Failed to save profile: ' + err.message, 'error');
    }
  });

  /* --------------------------------------------------
   *  SETTINGS
   * -------------------------------------------------- */

  async function loadSettings() {
    try {
      const res = await sendMessage('GET_SETTINGS');
      if (res?.settings) {
        autoFillToggle.checked = !!res.settings.autoFill;
        const ghostToggle = document.getElementById('ghostPreviewToggle');
        if (ghostToggle) {
          // Default to true if undefined
          ghostToggle.checked = res.settings.ghostPreviewEnabled !== false;
        }
      }
    } catch (_) {}
  }

  autoFillToggle.addEventListener('change', async () => {
    try {
      chrome.storage.local.set({ lazyfill_settings_autoFill: autoFillToggle.checked });
    } catch (_) {}
  });

  const ghostPreviewToggle = document.getElementById('ghostPreviewToggle');
  if (ghostPreviewToggle) {
    ghostPreviewToggle.addEventListener('change', async () => {
      try {
        await sendMessage('SET_GHOST_PREVIEW', { enabled: ghostPreviewToggle.checked });
      } catch (_) {}
    });
  }

  /* --------------------------------------------------
   *  COMPLETE AUTO FILL
   * -------------------------------------------------- */

  btnScan.addEventListener('click', async () => {
    await performCompleteAutoFill();
  });

  async function performCompleteAutoFill() {
    setStatus('scanning', 'Committing hints...');
    btnScan.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        setStatus('error', 'No active tab found');
        showToast('No active tab found.', 'error');
        return;
      }

      // 1. First attempt Instant-Commit via Full AI Mappings
      let commitResult;
      try {
        commitResult = await sendToTab(tab.id, { action: 'COMMIT_ALL_MAPPINGS' });
      } catch (err) {}

      if (commitResult && commitResult.success && commitResult.committed > 0) {
        // Success via Instant-Commit
        setStatus('success', `Instantly filled ${commitResult.committed} fields`);
        showToast(`✓ ${commitResult.committed} fields filled instantly!`, 'success');
        return; // We're done, skip fallback scan
      }

      // 2. Fallback: Manual Scan-and-Fill if no ghosts were active
      setStatus('scanning', 'No active ghosts found, running manual scan...');
      
      const scanResult = await sendToTab(tab.id, { action: 'SCAN_PAGE' }).catch(() => null);
      if (!scanResult?.success || scanResult.count === 0) {
        setStatus('error', 'No fillable fields found');
        showToast('No fillable form fields detected.', 'info');
        return;
      }

      setStatus('scanning', `Found ${scanResult.count} fields. Asking AI...`);
      const aiResult = await sendMessage('PROCESS_SCAN_RESULTS', {
        scannedFields: scanResult.scannedFields,
      });

      if (!aiResult?.success) {
        const errorMsg = aiResult?.error?.message || 'AI failed to generate fill data.';
        setStatus('error', 'Error: ' + errorMsg.split('.')[0]);
        showToast(errorMsg, 'error');
        return;
      }

      const fillResult = await sendToTab(tab.id, {
        action: 'FILL_FIELDS',
        payload: {
          mappings: aiResult.mappings,
          scannedFields: scanResult.scannedFields,
        },
      });

      setStatus('success', `Filled ${fillResult?.filled || 0} fields manually`);
      showToast(`✓ ${fillResult?.filled || 0} fields filled!`, 'success');

    } catch (err) {
      setStatus('error', 'Unexpected error');
      showToast('Error: ' + err.message, 'error');
    } finally {
      btnScan.disabled = false;
    }
  }

  /* --------------------------------------------------
   *  STATUS MANAGEMENT
   * -------------------------------------------------- */

  function setStatus(state, text) {
    statusCard.className = `status-card ${state}`;
    statusText.textContent = text;
  }

  /* --------------------------------------------------
   *  UTILITIES
   * -------------------------------------------------- */

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* --------------------------------------------------
   *  BOOT
   * -------------------------------------------------- */

  init().catch((err) => {
    console.error('[LazyFill Popup] Init failed:', err);
  });
})();
