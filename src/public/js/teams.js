// Team Management & Color Extractor Engine
(function () {
  'use strict';

  let allTeams = [];
  let pendingUploadData = null; // { base64, originalName }
  let pendingEditData = null;
  let currentEditLogoUrl = '';

  // DOM Elements - Form
  const formAdd = document.getElementById('form-add-team');
  const inputName = document.getElementById('input-team-name');
  const inputShort = document.getElementById('input-team-short');
  const dropzone = document.getElementById('team-dropzone');
  const fileInput = document.getElementById('file-team-logo');
  const logoPreviewBox = document.getElementById('logo-preview-box');
  const logoPreviewImg = document.getElementById('logo-preview-img');
  const btnClearLogo = document.getElementById('btn-clear-logo');
  const colorPrimary = document.getElementById('color-primary');
  const hexPrimary = document.getElementById('hex-primary');
  const colorSecondary = document.getElementById('color-secondary');
  const hexSecondary = document.getElementById('hex-secondary');
  const btnEyedropper = document.getElementById('btn-open-eyedropper');

  // DOM Elements - Live Preview
  const liveBadge = document.getElementById('live-team-badge');
  const liveLogoImg = document.getElementById('live-preview-logo-img');
  const liveInitials = document.getElementById('live-preview-initials');
  const liveName = document.getElementById('live-preview-name');
  const liveShort = document.getElementById('live-preview-short');

  // DOM Elements - Grid & Toolbar
  const teamsGrid = document.getElementById('teams-grid');
  const emptyState = document.getElementById('empty-state');
  const badgeTeamCount = document.getElementById('badge-team-count');
  const searchInput = document.getElementById('input-search-teams');

  // DOM Elements - Edit Modal
  const modalEdit = document.getElementById('modal-edit-team');
  const formEdit = document.getElementById('form-edit-team');
  const editId = document.getElementById('edit-team-id');
  const editName = document.getElementById('edit-team-name');
  const editShort = document.getElementById('edit-team-short');
  const editFile = document.getElementById('edit-team-file');
  const editLogoBox = document.getElementById('edit-logo-preview-box');
  const editLogoImg = document.getElementById('edit-logo-img');
  const btnEditClearLogo = document.getElementById('btn-edit-clear-logo');
  const editColorPrimary = document.getElementById('edit-color-primary');
  const editHexPrimary = document.getElementById('edit-hex-primary');
  const editColorSecondary = document.getElementById('edit-color-secondary');
  const editHexSecondary = document.getElementById('edit-hex-secondary');
  const btnEditEyedropper = document.getElementById('btn-edit-eyedropper');
  const editLiveBadge = document.getElementById('edit-live-badge');
  const editLiveLogoImg = document.getElementById('edit-live-logo-img');
  const editLiveInitials = document.getElementById('edit-live-initials');
  const editLiveName = document.getElementById('edit-live-name');
  const editLiveShort = document.getElementById('edit-live-short');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnLogout = document.getElementById('btn-logout');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg, isError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderColor = isError ? 'var(--crimson-light)' : 'var(--border-color)';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Check auth
  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated && btnLogout) {
        btnLogout.style.display = 'inline-flex';
        btnLogout.addEventListener('click', async () => {
          await fetch('/api/auth/logout', { method: 'POST' });
          window.location.href = '/login';
        });
      }
    } catch (e) {}
  }

  // Sync Color Pickers
  function syncColors(colorInput, hexInput, isPrimary, isEdit = false) {
    colorInput.addEventListener('input', () => {
      hexInput.value = colorInput.value.toUpperCase();
      if (isEdit) updateEditLivePreview();
      else updateLivePreview();
    });

    hexInput.addEventListener('change', () => {
      let val = hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        colorInput.value = val;
        hexInput.value = val.toUpperCase();
      } else {
        hexInput.value = colorInput.value.toUpperCase();
      }
      if (isEdit) updateEditLivePreview();
      else updateLivePreview();
    });
  }

  syncColors(colorPrimary, hexPrimary, true, false);
  syncColors(colorSecondary, hexSecondary, false, false);
  syncColors(editColorPrimary, editHexPrimary, true, true);
  syncColors(editColorSecondary, editHexSecondary, false, true);

  // Update Live Preview (Add form)
  function updateLivePreview() {
    const name = inputName.value.trim() || 'TAKIM ADI';
    const shortCode = inputShort.value.trim().toUpperCase() || (name.length >= 3 ? name.slice(0, 3).toUpperCase() : 'TAK');
    const c1 = colorPrimary.value || '#ffed00';
    const c2 = colorSecondary.value || '#002d72';

    liveName.textContent = name;
    liveShort.textContent = shortCode;
    liveInitials.textContent = shortCode.slice(0, 3);

    liveBadge.style.borderColor = c1;
    liveBadge.style.boxShadow = `0 4px 20px ${c1}33`;

    if (pendingUploadData && pendingUploadData.base64) {
      liveLogoImg.src = pendingUploadData.base64;
      liveLogoImg.style.display = 'block';
      liveInitials.style.display = 'none';
    } else {
      liveLogoImg.style.display = 'none';
      liveInitials.style.display = 'inline';
      liveInitials.style.color = c1;
    }
  }

  inputName.addEventListener('input', updateLivePreview);
  inputShort.addEventListener('input', updateLivePreview);

  // Update Edit Live Preview
  function updateEditLivePreview() {
    const name = editName.value.trim() || 'TAKIM ADI';
    const shortCode = editShort.value.trim().toUpperCase() || (name.length >= 3 ? name.slice(0, 3).toUpperCase() : 'TAK');
    const c1 = editColorPrimary.value || '#ffed00';
    const c2 = editColorSecondary.value || '#002d72';

    editLiveName.textContent = name;
    editLiveShort.textContent = shortCode;
    editLiveInitials.textContent = shortCode.slice(0, 3);

    editLiveBadge.style.borderColor = c1;
    editLiveBadge.style.boxShadow = `0 4px 20px ${c1}33`;

    const logoSrc = (pendingEditData && pendingEditData.base64) ? pendingEditData.base64 : currentEditLogoUrl;
    if (logoSrc) {
      editLiveLogoImg.src = logoSrc;
      editLiveLogoImg.style.display = 'block';
      editLiveInitials.style.display = 'none';
    } else {
      editLiveLogoImg.style.display = 'none';
      editLiveInitials.style.display = 'inline';
      editLiveInitials.style.color = c1;
    }
  }

  editName.addEventListener('input', updateEditLivePreview);
  editShort.addEventListener('input', updateEditLivePreview);

  // Handle Logo Upload (Add form)
  function handleLogoFile(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('Dosya boyutu 8 MB\'den büyük olamaz.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      pendingUploadData = {
        base64: e.target.result,
        originalName: file.name
      };
      logoPreviewImg.src = e.target.result;
      logoPreviewBox.style.display = 'flex';
      updateLivePreview();
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleLogoFile(e.target.files[0]);
    }
  });

  btnClearLogo.addEventListener('click', () => {
    pendingUploadData = null;
    fileInput.value = '';
    logoPreviewBox.style.display = 'none';
    updateLivePreview();
  });

  // Dropzone drag & drop
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleLogoFile(e.dataTransfer.files[0]);
    }
  });

  // Eyedropper on Add Form
  btnEyedropper.addEventListener('click', () => {
    const logoSrc = pendingUploadData?.base64;
    if (!logoSrc) {
      alert('Renkleri logodan seçebilmek için lütfen önce bir logo yükleyin.');
      return;
    }

    if (typeof window.openLogoEyedropper === 'function') {
      window.openLogoEyedropper({
        logoUrl: logoSrc,
        teamTitle: inputName.value.trim() || 'Yeni Takım',
        initialColor1: colorPrimary.value,
        initialColor2: colorSecondary.value,
        onApply: (c1, c2) => {
          colorPrimary.value = c1;
          hexPrimary.value = c1.toUpperCase();
          colorSecondary.value = c2;
          hexSecondary.value = c2.toUpperCase();
          updateLivePreview();
          showToast('Renkler logodan başarıyla aktarıldı!');
        }
      });
    }
  });

  // Load Teams from API
  async function loadTeams() {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      if (data.success && Array.isArray(data.teams)) {
        allTeams = data.teams;
        renderTeamsGrid();
      } else {
        showToast('Takımlar yüklenirken hata oluştu.', true);
      }
    } catch (err) {
      console.error('Failed to load teams:', err);
      showToast('Sunucuya bağlanılamadı.', true);
    }
  }

  // Render Teams Grid
  function renderTeamsGrid() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = allTeams.filter(t => {
      if (!query) return true;
      const name = (t.name || '').toLowerCase();
      const shortCode = (t.shortName || '').toLowerCase();
      return name.includes(query) || shortCode.includes(query);
    });

    badgeTeamCount.textContent = `${filtered.length} Takım`;

    if (filtered.length === 0) {
      teamsGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    teamsGrid.innerHTML = filtered.map(t => {
      const safeName = escapeHtml(t.name);
      const safeShort = escapeHtml(t.shortName || (t.name.slice(0, 3).toUpperCase()));
      const c1 = t.color || '#ffed00';
      const c2 = t.color2 || '#002d72';

      const avatarContent = t.logo 
        ? `<img src="${t.logo}" alt="${safeName}" onerror="this.src='/assets/volleyball.svg'">`
        : `<span style="color: ${c1}; font-weight: 900;">${safeShort.slice(0, 3)}</span>`;

      return `
        <div class="team-card" data-id="${t.id}">
          <div class="team-card-banner" style="background: linear-gradient(90deg, ${c1} 50%, ${c2} 50%);"></div>
          <div class="team-card-body">
            <div class="team-card-avatar" style="border-color: ${c1}44;">
              ${avatarContent}
            </div>
            <div class="team-card-info">
              <div class="team-card-name" title="${safeName}">${safeName}</div>
              <div class="team-card-meta">
                <span class="team-short-badge">${safeShort}</span>
                <div class="team-color-swatches" title="1. Renk: ${c1}, 2. Renk: ${c2}">
                  <div class="team-swatch" style="background: ${c1};"></div>
                  <div class="team-swatch" style="background: ${c2};"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="team-card-footer">
            <button type="button" class="btn-card-action btn-edit-team" data-id="${t.id}">
              ✏️ Düzenle
            </button>
            <button type="button" class="btn-card-action danger btn-delete-team" data-id="${t.id}">
              🗑️ Sil
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    teamsGrid.querySelectorAll('.btn-edit-team').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    teamsGrid.querySelectorAll('.btn-delete-team').forEach(btn => {
      btn.addEventListener('click', () => deleteTeamPrompt(btn.dataset.id));
    });
  }

  searchInput.addEventListener('input', renderTeamsGrid);

  // Submit Add Team Form
  formAdd.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = inputName.value.trim();
    if (!name) return;

    const shortName = inputShort.value.trim().toUpperCase();
    const color = colorPrimary.value;
    const color2 = colorSecondary.value;

    const payload = {
      name,
      shortName,
      color,
      color2,
      data: pendingUploadData ? pendingUploadData.base64 : null,
      originalName: pendingUploadData ? pendingUploadData.originalName : null
    };

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Takım eklenemedi.', true);
        return;
      }

      showToast(`✓ "${name}" takımı başarıyla kaydedildi!`);
      // Reset form
      inputName.value = '';
      inputShort.value = '';
      pendingUploadData = null;
      fileInput.value = '';
      logoPreviewBox.style.display = 'none';
      updateLivePreview();
      loadTeams();
    } catch (err) {
      showToast('İşlem başarısız.', true);
    }
  });

  // Open Edit Modal
  function openEditModal(id) {
    const team = allTeams.find(t => t.id === id);
    if (!team) return;

    editId.value = team.id;
    editName.value = team.name;
    editShort.value = team.shortName || '';
    editColorPrimary.value = team.color || '#ffed00';
    editHexPrimary.value = (team.color || '#FFED00').toUpperCase();
    editColorSecondary.value = team.color2 || '#002d72';
    editHexSecondary.value = (team.color2 || '#002D72').toUpperCase();

    pendingEditData = null;
    editFile.value = '';
    currentEditLogoUrl = team.logo || '';

    if (currentEditLogoUrl) {
      editLogoImg.src = currentEditLogoUrl;
      editLogoBox.style.display = 'flex';
    } else {
      editLogoBox.style.display = 'none';
    }

    updateEditLivePreview();
    modalEdit.classList.add('active');
  }

  // Handle Edit File
  editFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = function (ev) {
        pendingEditData = {
          base64: ev.target.result,
          originalName: file.name
        };
        editLogoImg.src = ev.target.result;
        editLogoBox.style.display = 'flex';
        updateEditLivePreview();
      };
      reader.readAsDataURL(file);
    }
  });

  btnEditClearLogo.addEventListener('click', () => {
    pendingEditData = null;
    currentEditLogoUrl = '';
    editFile.value = '';
    editLogoBox.style.display = 'none';
    updateEditLivePreview();
  });

  // Eyedropper on Edit Modal
  btnEditEyedropper.addEventListener('click', () => {
    const logoSrc = (pendingEditData && pendingEditData.base64) ? pendingEditData.base64 : currentEditLogoUrl;
    if (!logoSrc) {
      alert('Renkleri logodan seçebilmek için bu takımın bir logosu olmalıdır.');
      return;
    }

    if (typeof window.openLogoEyedropper === 'function') {
      window.openLogoEyedropper({
        logoUrl: logoSrc,
        teamTitle: editName.value.trim() || 'Takım',
        initialColor1: editColorPrimary.value,
        initialColor2: editColorSecondary.value,
        onApply: (c1, c2) => {
          editColorPrimary.value = c1;
          editHexPrimary.value = c1.toUpperCase();
          editColorSecondary.value = c2;
          editHexSecondary.value = c2.toUpperCase();
          updateEditLivePreview();
          showToast('Renkler güncellendi!');
        }
      });
    }
  });

  // Submit Edit Form
  formEdit.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editId.value;
    const name = editName.value.trim();
    if (!name) return;

    const payload = {
      name,
      shortName: editShort.value.trim().toUpperCase(),
      color: editColorPrimary.value,
      color2: editColorSecondary.value,
      logo: currentEditLogoUrl,
      data: pendingEditData ? pendingEditData.base64 : null,
      originalName: pendingEditData ? pendingEditData.originalName : null
    };

    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast(data.error || 'Güncelleme başarısız.', true);
        return;
      }

      showToast('✓ Takım bilgileri güncellendi!');
      modalEdit.classList.remove('active');
      loadTeams();
    } catch (err) {
      showToast('Bağlantı hatası.', true);
    }
  });

  btnCloseEditModal.addEventListener('click', () => modalEdit.classList.remove('active'));
  btnCancelEdit.addEventListener('click', () => modalEdit.classList.remove('active'));

  // Delete Team Prompt (Works for all teams including default ones!)
  async function deleteTeamPrompt(id) {
    const team = allTeams.find(t => t.id === id);
    const teamName = team ? team.name : 'Bu takım';

    if (!confirm(`"${teamName}" takımını silmek istediğinizden emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || 'Takım silinemedi.', true);
        return;
      }

      showToast(`✓ "${teamName}" silindi.`);
      loadTeams();
    } catch (err) {
      showToast('Silme işlemi başarısız.', true);
    }
  }

  // Initial load
  checkAuth();
  updateLivePreview();
  loadTeams();
})();
