/**
 * Eyedropper & Logo Color Extractor Tool
 * Allows sampling colors directly from a team's logo or screen via canvas & palette.
 */
(function() {
  'use strict';

  let activeSlot = 1;
  let currentColor1 = '#ffed00';
  let currentColor2 = '#002d72';
  let currentOnApply = null;
  let currentCtx = null;
  let currentCanvas = null;

  function rgbToHex(r, g, b) {
    const toH = (c) => {
      const hex = Math.max(0, Math.min(255, c)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toH(r)}${toH(g)}${toH(b)}`;
  }

  function colorDistance(c1, c2) {
    const dr = c1[0] - c2[0];
    const dg = c1[1] - c2[1];
    const db = c1[2] - c2[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function extractDominantColors(ctx, width, height) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height).data;
      const step = 3; // sample every 3rd pixel for speed
      const colorCounts = {};

      for (let i = 0; i < imgData.length; i += 4 * step) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        const a = imgData[i + 3];

        // Ignore transparent or nearly transparent pixels
        if (a < 100) continue;

        // Quantize color into bins to group similar shades
        const qr = Math.round(r / 24) * 24;
        const qg = Math.round(g / 24) * 24;
        const qb = Math.round(b / 24) * 24;
        const key = `${qr},${qg},${qb}`;

        if (!colorCounts[key]) {
          colorCounts[key] = { r: qr, g: qg, b: qb, count: 0 };
        }
        colorCounts[key].count++;
      }

      // Sort by frequency
      const sorted = Object.values(colorCounts).sort((a, b) => b.count - a.count);

      // Filter distinct colors
      const distinct = [];
      for (const item of sorted) {
        const isFarEnough = distinct.every(d => colorDistance([d.r, d.g, d.b], [item.r, item.g, item.b]) >= 40);
        if (isFarEnough) {
          distinct.push(item);
          if (distinct.length >= 10) break;
        }
      }

      return distinct.map(d => rgbToHex(d.r, d.g, d.b));
    } catch (err) {
      console.warn('Could not extract dominant colors:', err);
      return [];
    }
  }

  function ensureModal() {
    let modal = document.getElementById('modal-logo-eyedropper');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'modal-backdrop modal-eyedropper-backdrop';
    modal.id = 'modal-logo-eyedropper';

    modal.innerHTML = `
      <div class="modal-box" style="max-width: 520px;">
        <div class="flex-between" style="margin-bottom: 14px;">
          <h3 style="font-weight: 800; font-size: 1.15rem; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 1.3rem;">💧</span> <span id="eyedropper-modal-title">Logodan Renk Seç</span>
          </h3>
          <button type="button" class="btn-modal-close" id="btn-close-eyedropper">&times;</button>
        </div>

        <!-- Active Slot Selection -->
        <div class="eyedropper-slot-container">
          <div class="eyedropper-slot-label">Düzenlenecek Takım Rengi Seçin:</div>
          <div class="eyedropper-slots">
            <button type="button" class="eyedropper-slot-btn active" data-slot="1" id="eyedropper-slot-1">
              <div class="eyedropper-color-badge" id="eyedropper-badge-1"></div>
              <div class="eyedropper-slot-info">
                <span class="eyedropper-slot-title">1. Renk (Ana Renk)</span>
                <span class="eyedropper-slot-hex" id="eyedropper-hex-1">#ffffff</span>
              </div>
            </button>
            <button type="button" class="eyedropper-slot-btn" data-slot="2" id="eyedropper-slot-2">
              <div class="eyedropper-color-badge" id="eyedropper-badge-2"></div>
              <div class="eyedropper-slot-info">
                <span class="eyedropper-slot-title">2. Renk (İkincil Renk)</span>
                <span class="eyedropper-slot-hex" id="eyedropper-hex-2">#000000</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Scoreboard Stripe Preview -->
        <div class="eyedropper-stripe-preview-wrap">
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700;">Skorboard Şerit Önizlemesi:</span>
          <div class="eyedropper-stripe-preview">
            <div class="eyedropper-stripe-part-1" id="eyedropper-stripe-1"></div>
            <div class="eyedropper-stripe-part-2" id="eyedropper-stripe-2"></div>
          </div>
        </div>

        <!-- Canvas Instructions & Hover Indicator -->
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; min-height: 22px;">
          <span>Logoya tıklayarak rengi seçin:</span>
          <span id="eyedropper-hover-wrap" style="display: none; align-items: center; gap: 6px;">
            <span id="eyedropper-hover-badge" style="width: 16px; height: 16px; border-radius: 3px; display: inline-block; border: 1px solid rgba(255,255,255,0.8);"></span>
            <span id="eyedropper-hover-hex" style="font-family: monospace; font-size: 0.8rem; font-weight: 700; color: #fff;"></span>
          </span>
        </div>

        <!-- Canvas Card -->
        <div class="eyedropper-canvas-card">
          <div class="eyedropper-canvas-wrapper" id="eyedropper-canvas-wrap">
            <canvas id="eyedropper-canvas" width="300" height="200"></canvas>
          </div>
          <div id="eyedropper-canvas-error" style="display: none; text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px;">
            Logo yüklenemedi. Aşağıdaki ekrandan seçim düğmesini kullanabilirsiniz.
          </div>
        </div>

        <!-- Dominant Logo Colors Palette -->
        <div style="margin-top: 14px;" id="eyedropper-palette-section">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">
            🎨 Logoda Öne Çıkan Renkler:
          </div>
          <div class="eyedropper-palette" id="eyedropper-palette">
            <!-- Palette swatches injected dynamically -->
          </div>
        </div>

        <!-- Screen Eyedropper Option -->
        <div id="eyedropper-native-wrap" style="margin-top: 12px; display: none;">
          <button type="button" class="btn-link btn-secondary" id="btn-native-eyedropper" style="width: 100%; justify-content: center; font-size: 0.82rem; padding: 7px 12px; cursor: pointer;">
            🖥️ Ekrandan Herhangi Bir Yeri Damlalıkla Seç
          </button>
        </div>

        <!-- Modal Footer -->
        <div class="flex-between" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color);">
          <button type="button" class="btn-link btn-secondary" id="btn-cancel-eyedropper" style="padding: 8px 16px; font-size: 0.85rem; cursor: pointer;">
            Vazgeç
          </button>
          <button type="button" class="btn-modal-save" id="btn-apply-eyedropper" style="padding: 8px 20px; font-size: 0.85rem; width: auto; margin-top: 0; cursor: pointer;">
            Renkleri Uygula
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Bind event listeners once
    bindModalEvents(modal);

    return modal;
  }

  function updateSlotUI() {
    const badge1 = document.getElementById('eyedropper-badge-1');
    const badge2 = document.getElementById('eyedropper-badge-2');
    const hex1 = document.getElementById('eyedropper-hex-1');
    const hex2 = document.getElementById('eyedropper-hex-2');
    const stripe1 = document.getElementById('eyedropper-stripe-1');
    const stripe2 = document.getElementById('eyedropper-stripe-2');

    if (badge1) badge1.style.backgroundColor = currentColor1;
    if (badge2) badge2.style.backgroundColor = currentColor2;
    if (hex1) hex1.textContent = currentColor1.toUpperCase();
    if (hex2) hex2.textContent = currentColor2.toUpperCase();
    if (stripe1) stripe1.style.backgroundColor = currentColor1;
    if (stripe2) stripe2.style.backgroundColor = currentColor2;

    const btn1 = document.getElementById('eyedropper-slot-1');
    const btn2 = document.getElementById('eyedropper-slot-2');
    if (btn1 && btn2) {
      if (activeSlot === 1) {
        btn1.classList.add('active');
        btn2.classList.remove('active');
      } else {
        btn1.classList.remove('active');
        btn2.classList.add('active');
      }
    }
  }

  function setActiveColor(hex, autoAdvance = true) {
    if (activeSlot === 1) {
      currentColor1 = hex;
      if (autoAdvance) {
        activeSlot = 2; // Auto advance to slot 2 for fluid picking!
      }
    } else {
      currentColor2 = hex;
    }
    updateSlotUI();
  }

  function bindModalEvents(modal) {
    // Close / Cancel
    const closeBtn = document.getElementById('btn-close-eyedropper');
    const cancelBtn = document.getElementById('btn-cancel-eyedropper');
    const closeModal = () => modal.classList.remove('active');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Slot switching buttons
    const btn1 = document.getElementById('eyedropper-slot-1');
    const btn2 = document.getElementById('eyedropper-slot-2');
    if (btn1) {
      btn1.addEventListener('click', () => {
        activeSlot = 1;
        updateSlotUI();
      });
    }
    if (btn2) {
      btn2.addEventListener('click', () => {
        activeSlot = 2;
        updateSlotUI();
      });
    }

    // Apply button
    const applyBtn = document.getElementById('btn-apply-eyedropper');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        if (typeof currentOnApply === 'function') {
          currentOnApply(currentColor1, currentColor2);
        }
        closeModal();
      });
    }

    // Native EyeDropper API (Chromium)
    if (window.EyeDropper) {
      const nativeWrap = document.getElementById('eyedropper-native-wrap');
      const nativeBtn = document.getElementById('btn-native-eyedropper');
      if (nativeWrap) nativeWrap.style.display = 'block';
      if (nativeBtn) {
        nativeBtn.addEventListener('click', async () => {
          try {
            const eyeDropper = new window.EyeDropper();
            const result = await eyeDropper.open();
            if (result && result.sRGBHex) {
              setActiveColor(result.sRGBHex, true);
            }
          } catch (err) {
            // User cancelled eyedropper
          }
        });
      }
    }

    // Canvas hover & click
    const canvas = document.getElementById('eyedropper-canvas');
    currentCanvas = canvas;
    currentCtx = canvas.getContext('2d', { willReadFrequently: true });

    const hoverWrap = document.getElementById('eyedropper-hover-wrap');
    const hoverBadge = document.getElementById('eyedropper-hover-badge');
    const hoverHex = document.getElementById('eyedropper-hover-hex');

    canvas.addEventListener('mousemove', (e) => {
      if (!currentCtx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

      try {
        const pixel = currentCtx.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 15) {
          const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
          if (hoverWrap) hoverWrap.style.display = 'flex';
          if (hoverBadge) hoverBadge.style.backgroundColor = hex;
          if (hoverHex) hoverHex.textContent = hex.toUpperCase();
        } else {
          if (hoverWrap) hoverWrap.style.display = 'none';
        }
      } catch (err) {
        // Ignored
      }
    });

    canvas.addEventListener('mouseleave', () => {
      if (hoverWrap) hoverWrap.style.display = 'none';
    });

    canvas.addEventListener('click', (e) => {
      if (!currentCtx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor((e.clientX - rect.left) * scaleX)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor((e.clientY - rect.top) * scaleY)));

      try {
        const pixel = currentCtx.getImageData(x, y, 1, 1).data;
        if (pixel[3] > 15) {
          const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
          setActiveColor(hex, true);
        }
      } catch (err) {
        console.error('Canvas pixel pick error:', err);
      }
    });
  }

  /**
   * Open Eyedropper Modal
   * @param {Object} options
   * @param {string} options.logoUrl - URL of team logo
   * @param {string} [options.teamTitle] - Team name or title
   * @param {string} options.initialColor1 - Hex string
   * @param {string} options.initialColor2 - Hex string
   * @param {Function} options.onApply - callback(color1, color2)
   */
  window.openLogoEyedropper = function(options) {
    const modal = ensureModal();
    activeSlot = 1;
    currentColor1 = options.initialColor1 || '#ffed00';
    currentColor2 = options.initialColor2 || '#002d72';
    currentOnApply = options.onApply;

    const titleEl = document.getElementById('eyedropper-modal-title');
    if (titleEl) {
      titleEl.textContent = options.teamTitle ? `${options.teamTitle} - Logodan Renk Seç` : 'Logodan Renk Seç';
    }

    updateSlotUI();

    const canvas = document.getElementById('eyedropper-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    currentCtx = ctx;

    const canvasWrap = document.getElementById('eyedropper-canvas-wrap');
    const canvasErr = document.getElementById('eyedropper-canvas-error');
    const paletteContainer = document.getElementById('eyedropper-palette');
    const paletteSection = document.getElementById('eyedropper-palette-section');

    if (canvasWrap) canvasWrap.style.display = 'inline-block';
    if (canvasErr) canvasErr.style.display = 'none';
    if (paletteContainer) paletteContainer.innerHTML = '<span style="font-size: 0.8rem; color: var(--text-muted);">Renkler analiz ediliyor...</span>';

    // Load logo image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Calculate target canvas size keeping aspect ratio within max 300x200
      const maxWidth = 300;
      const maxHeight = 200;
      let w = img.naturalWidth || img.width || 200;
      let h = img.naturalHeight || img.height || 200;

      const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
      const targetW = Math.max(80, Math.round(w * ratio));
      const targetH = Math.max(80, Math.round(h * ratio));

      canvas.width = targetW;
      canvas.height = targetH;

      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // Extract colors
      const colors = extractDominantColors(ctx, targetW, targetH);

      if (paletteContainer) {
        paletteContainer.innerHTML = '';
        if (colors.length > 0) {
          if (paletteSection) paletteSection.style.display = 'block';
          colors.forEach(hex => {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.backgroundColor = hex;
            swatch.title = `${hex.toUpperCase()} (Tıklayarak Seç)`;
            swatch.addEventListener('click', () => {
              setActiveColor(hex, true);
            });
            paletteContainer.appendChild(swatch);
          });
        } else {
          paletteContainer.innerHTML = '<span style="font-size: 0.78rem; color: var(--text-muted);">Logodan belirgin renk tespit edilemedi. Logoya tıklayabilirsiniz.</span>';
        }
      }
    };

    img.onerror = () => {
      if (canvasWrap) canvasWrap.style.display = 'none';
      if (canvasErr) canvasErr.style.display = 'block';
      if (paletteSection) paletteSection.style.display = 'none';
    };

    img.src = options.logoUrl || '/assets/fenerbahce.svg';

    modal.classList.add('active');
  };

})();
