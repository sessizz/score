// Logo Management & Library Engine
(function () {
  let allLogos = [];
  let pendingUploadData = null; // { base64, originalName }
  let pendingEditData = null;

  const logosGrid = document.getElementById('logos-grid');
  const emptyState = document.getElementById('empty-state');
  const badgeLogoCount = document.getElementById('badge-logo-count');
  const searchInput = document.getElementById('input-search-logos');

  const uploadDropzone = document.getElementById('upload-dropzone');
  const fileInput = document.getElementById('file-logo-input');
  const previewBox = document.getElementById('upload-preview-box');
  const previewImg = document.getElementById('upload-preview-img');
  const btnClearPreview = document.getElementById('btn-clear-preview');
  const inputLogoName = document.getElementById('input-logo-name');
  const formUploadLogo = document.getElementById('form-upload-logo');
  const btnSaveLogo = document.getElementById('btn-save-logo');

  const modalEdit = document.getElementById('modal-edit-logo');
  const formEditLogo = document.getElementById('form-edit-logo');
  const editLogoId = document.getElementById('edit-logo-id');
  const editLogoName = document.getElementById('edit-logo-name');
  const editLogoFile = document.getElementById('edit-logo-file');
  const editPreviewImg = document.getElementById('edit-preview-img');
  const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  function showToast(msg) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Load logos from server
  async function loadLogos() {
    try {
      const res = await fetch('/api/logos');
      const data = await res.json();
      if (data.success && Array.isArray(data.logos)) {
        allLogos = data.logos;
        renderLogos();
      } else {
        showToast('Logolar yüklenirken hata oluştu.');
      }
    } catch (err) {
      console.error('Failed to load logos:', err);
      showToast('Bağlantı hatası.');
    }
  }

  function renderLogos() {
    const query = (searchInput.value || '').trim().toLowerCase();
    const filtered = allLogos.filter(item => {
      if (!query) return true;
      return (item.name || '').toLowerCase().includes(query);
    });

    badgeLogoCount.textContent = `${filtered.length} Logo`;

    if (filtered.length === 0) {
      logosGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    logosGrid.innerHTML = filtered.map(logo => {
      const isDefault = Boolean(logo.isDefault);
      const safeName = escapeHtml(logo.name);
      return `
        <div class="logo-card" data-id="${logo.id}">
          <div class="logo-card-thumb">
            <img src="${logo.url}" alt="${safeName}" onerror="this.src='/assets/volleyball.svg'">
          </div>
          <div class="logo-card-name" title="${safeName}">${safeName}</div>
          <div class="logo-card-meta">
            <span>${isDefault ? '⭐ Varsayılan' : '📁 Özel'}</span>
            <button type="button" class="btn-copy-url" data-url="${logo.url}" style="background: none; border: none; color: var(--fb-yellow); cursor: pointer; font-size: 0.75rem; font-weight: 700;">
              URL Kopyala
            </button>
          </div>
          <div class="logo-card-actions">
            <button type="button" class="btn-card-action btn-edit-logo" data-id="${logo.id}">
              ✏️ Düzenle
            </button>
            <button type="button" class="btn-card-action danger btn-delete-logo" data-id="${logo.id}">
              🗑️ Sil
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach card listeners
    logosGrid.querySelectorAll('.btn-copy-url').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        navigator.clipboard.writeText(window.location.origin + url);
        showToast('Logo adresi panoya kopyalandı!');
      });
    });

    logosGrid.querySelectorAll('.btn-edit-logo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(btn.dataset.id);
      });
    });

    logosGrid.querySelectorAll('.btn-delete-logo').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLogoPrompt(btn.dataset.id);
      });
    });
  }

  // Handle File to Base64
  function handleSelectedFile(file) {
    if (!file) return;

    // Check size max 8MB
    if (file.size > 8 * 1024 * 1024) {
      alert('Seçilen dosya 8 MB\'den büyük olamaz.');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      pendingUploadData = {
        base64: e.target.result,
        originalName: file.name
      };

      // Show preview
      previewImg.src = e.target.result;
      previewBox.style.display = 'flex';
      uploadDropzone.style.display = 'none';

      // Auto-suggest name if empty
      if (!inputLogoName.value.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '') // remove extension
          .replace(/[_-]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        inputLogoName.value = cleanName;
      }
    };
    reader.readAsDataURL(file);
  }

  // Clear Upload Preview
  function resetUploadForm() {
    pendingUploadData = null;
    fileInput.value = '';
    previewImg.src = '';
    previewBox.style.display = 'none';
    uploadDropzone.style.display = 'block';
    inputLogoName.value = '';
  }

  btnClearPreview.addEventListener('click', resetUploadForm);

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  // Drag & Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadDropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadDropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadDropzone.classList.remove('dragover');
    }, false);
  });

  uploadDropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      handleSelectedFile(dt.files[0]);
    }
  });

  // Submit Upload Form
  formUploadLogo.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = inputLogoName.value.trim();
    if (!name) {
      alert('Lütfen logo veya takım ismini girin.');
      return;
    }

    if (!pendingUploadData || !pendingUploadData.base64) {
      alert('Lütfen bir logo görseli seçin veya yükleyin.');
      return;
    }

    btnSaveLogo.disabled = true;
    btnSaveLogo.textContent = 'Kaydediliyor...';

    try {
      const res = await fetch('/api/logos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          data: pendingUploadData.base64,
          originalName: pendingUploadData.originalName
        })
      });

      const data = await res.json();
      if (data.success && data.logo) {
        showToast(`"${data.logo.name}" başarıyla eklendi!`);
        resetUploadForm();
        await loadLogos();
      } else {
        alert(data.error || 'Logo kaydedilemedi.');
      }
    } catch (err) {
      console.error(err);
      alert('Sunucuya bağlanırken hata oluştu.');
    } finally {
      btnSaveLogo.disabled = false;
      btnSaveLogo.textContent = '💾 Logoyu Kütüphaneye Kaydet';
    }
  });

  // Edit Modal Handling
  function openEditModal(id) {
    const logo = allLogos.find(l => l.id === id);
    if (!logo) return;

    editLogoId.value = logo.id;
    editLogoName.value = logo.name;
    editPreviewImg.src = logo.url;
    editLogoFile.value = '';
    pendingEditData = null;

    modalEdit.classList.add('active');
  }

  function closeEditModal() {
    modalEdit.classList.remove('active');
    pendingEditData = null;
    editLogoFile.value = '';
  }

  btnCloseEditModal.addEventListener('click', closeEditModal);
  btnCancelEdit.addEventListener('click', closeEditModal);

  editLogoFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = function (ev) {
        pendingEditData = {
          base64: ev.target.result,
          originalName: file.name
        };
        editPreviewImg.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  });

  formEditLogo.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editLogoId.value;
    const name = editLogoName.value.trim();

    if (!name) {
      alert('İsim alanı boş bırakılamaz.');
      return;
    }

    const payload = { name };
    if (pendingEditData && pendingEditData.base64) {
      payload.data = pendingEditData.base64;
      payload.originalName = pendingEditData.originalName;
    }

    try {
      const res = await fetch(`/api/logos/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showToast('Logo başarıyla güncellendi!');
        closeEditModal();
        await loadLogos();
      } else {
        alert(data.error || 'Güncelleme başarısız.');
      }
    } catch (err) {
      console.error(err);
      alert('Sunucu hatası.');
    }
  });

  // Delete Handling
  async function deleteLogoPrompt(id) {
    const logo = allLogos.find(l => l.id === id);
    if (!logo) return;

    if (!confirm(`"${logo.name}" logosunu silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/logos/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        showToast(`"${logo.name}" silindi.`);
        await loadLogos();
      } else {
        alert(data.error || 'Logo silinemedi.');
      }
    } catch (err) {
      console.error(err);
      alert('Sunucu hatası.');
    }
  }

  // Search Filter
  searchInput.addEventListener('input', renderLogos);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initial Load
  loadLogos();
})();
