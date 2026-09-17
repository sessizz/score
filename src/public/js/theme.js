/**
 * VoleybolSkor — Theme Toggle System
 * 
 * Supports: dark / light / system (auto)
 * Persists choice to localStorage.
 * Falls back to system preference if no explicit choice.
 */

(function initTheme() {
  var saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    // Follow system preference
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
})();

/**
 * Toggle between dark and light theme
 */
function toggleTheme() {
  var html = document.documentElement;
  var current = html.getAttribute('data-theme');
  var next = (current === 'light') ? 'dark' : 'light';

  html.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);

  // Update any toggle button icons
  updateToggleIcons();
}

/**
 * Update toggle button icon visibility (handled by CSS, but this ensures consistency)
 */
function updateToggleIcons() {
  // CSS handles icon visibility via [data-theme="light"] selectors
  // This function is a hook for any JS-driven updates
}

/**
 * Listen for system preference changes when no explicit theme is set
 */
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    if (!localStorage.getItem('theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

/**
 * Helper: Create theme toggle button HTML
 * Usage: Insert this HTML into any navbar
 */
function getThemeToggleHTML() {
  return '<button class="theme-toggle" onclick="toggleTheme()" title="Tema Değiştir" aria-label="Tema Değiştir">' +
    '<span class="icon-moon">🌙</span>' +
    '<span class="icon-sun">☀️</span>' +
    '</button>';
}
