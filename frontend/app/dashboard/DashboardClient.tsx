'use client';

import { useEffect } from 'react';

export default function DashboardClient() {
  useEffect(() => {
    // --- Theme Switcher Logic ---
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeDropdown = document.getElementById('theme-dropdown');
    const themeOptions = document.querySelectorAll('.theme-option');
    
    const setTheme = (themeName: string) => {
      const link = document.getElementById('theme-stylesheet') as HTMLLinkElement;
      if (link) {
        link.href = `/dashboard/themes/${themeName}.css`;
      }
      localStorage.setItem('askfdalabel-theme', themeName);
    };

    // Initialize Theme
    const savedTheme = localStorage.getItem('askfdalabel-theme') || 'modern';
    setTheme(savedTheme);

    // Toggle Dropdown
    if (themeBtn && themeDropdown) {
      themeBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = themeDropdown.style.display === 'block';
        themeDropdown.style.display = isVisible ? 'none' : 'block';
      };
    }

    // Handle Selection
    themeOptions.forEach(option => {
      (option as HTMLElement).onclick = () => {
        const selectedTheme = option.getAttribute('data-theme');
        if (selectedTheme) setTheme(selectedTheme);
        if (themeDropdown) themeDropdown.style.display = 'none';
      };
    });

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
      if (themeBtn && themeDropdown && !themeBtn.contains(e.target as Node) && !themeDropdown.contains(e.target as Node)) {
        themeDropdown.style.display = 'none';
      }
    });

    // --- Info Modal Logic ---
    const infoBtn = document.getElementById('info-btn');
    const infoModal = document.getElementById('info-modal');
    const closeInfoBtn = document.getElementById('close-info-modal');

    if (infoBtn && infoModal) {
      infoBtn.onclick = () => {
        infoModal.classList.add('show');
        infoModal.style.display = 'block'; 
      };

      const closeModal = () => {
        infoModal.classList.remove('show');
        setTimeout(() => {
          if (!infoModal.classList.contains('show')) {
            infoModal.style.display = 'none';
          }
        }, 300); 
      };

      if (closeInfoBtn) closeInfoBtn.onclick = closeModal;
      
      window.addEventListener('click', (e) => {
        if (e.target === infoModal) closeModal();
      });
    }

    // --- AI Config Modal ---
    const aiConfigBtn = document.getElementById('ai-config-btn');
    const aiConfigModal = document.getElementById('ai-config-modal');
    const closeAiConfig = document.getElementById('close-ai-config');

    if (aiConfigBtn && aiConfigModal) {
      aiConfigBtn.onclick = () => {
        aiConfigModal.style.display = 'block';
      };
      if (closeAiConfig) closeAiConfig.onclick = () => {
        aiConfigModal.style.display = 'none';
      };
    }

  }, []);

  return null;
}
