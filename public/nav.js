// Navigation Component with Login State Management
(function() {
  'use strict';

  // Check if user is logged in (admin password exists in sessionStorage)
  function isLoggedIn() {
    return sessionStorage.getItem('adminPassword') !== null;
  }

  // Create navigation HTML
  function createNav() {
    const loggedIn = isLoggedIn();
    const isTestMode = sessionStorage.getItem('testMode') === 'true';
    
    const navHTML = `
      <style>
        #nav-overlay {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          z-index: 998;
        }

        #nav-overlay.active {
          display: block;
        }

        #main-nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: rgba(26, 26, 46, 0.95);
          backdrop-filter: blur(15px);
          -webkit-backdrop-filter: blur(15px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          z-index: 999;
          padding: 15px 20px;
          transition: background 0.3s ease;
        }

        #main-nav.test-mode {
          background: rgba(255, 152, 0, 0.98);
          border-bottom: 2px solid #ff9800;
        }

        #main-nav.test-mode .nav-links a {
          color: #000 !important;
          font-weight: 600;
        }

        #main-nav.test-mode .nav-links a:hover {
          color: #fff !important;
        }

        #main-nav.test-mode .nav-links a.active {
          background: rgba(0, 0, 0, 0.3) !important;
          color: #fff !important;
        }

        #main-nav.test-mode .nav-logout {
          background: #000 !important;
          color: #FF7D00 !important;
        }

        #main-nav.test-mode .nav-logout:hover {
          background: #1a1a1a !important;
          color: #ffb84d !important;
        }

        #main-nav.test-mode .nav-toggle {
          color: #000;
        }

        .test-mode-badge {
          background: #000;
          color: #ff9800;
          padding: 4px 12px;
          border-radius: 6px;
          font-weight: bold;
          font-size: 14px;
          margin-left: 10px;
          display: none;
        }

        #main-nav.test-mode .test-mode-badge {
          display: inline-block;
        }

        .test-mode-toggle-nav {
          display: none;
          align-items: center;
          gap: 8px;
        }

        .test-mode-toggle-nav.show {
          display: flex;
        }

        .nav-logout-btn {
          display: none;
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.4);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.95rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .nav-logout-btn.show {
          display: block;
        }

        .nav-logout-btn:hover {
          background: rgba(239, 68, 68, 0.3);
          color: #ff5555;
          border-color: rgba(239, 68, 68, 0.5);
        }

        #main-nav.test-mode .nav-logout-btn {
          background: #000;
          color: #fff;
          border-color: rgba(0, 0, 0, 0.5);
        }

        #main-nav.test-mode .nav-logout-btn:hover {
          background: #1a1a1a;
          color: #fff;
          border-color: rgba(0, 0, 0, 0.7);
        }

        .test-mode-toggle-nav label {
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        #main-nav.test-mode .test-mode-toggle-nav label {
          color: #000;
        }

        /* Mobile sidebar in test mode */
        #main-nav.test-mode .nav-links {
          background: rgba(255, 152, 0, 0.98);
        }

        #main-nav.test-mode .nav-links a {
          color: #000 !important;
        }

        #main-nav.test-mode .nav-links a:hover {
          background: rgba(0, 0, 0, 0.2);
          color: #fff !important;
        }

        #main-nav.test-mode .nav-links a.active {
          background: rgba(0, 0, 0, 0.3);
          color: #fff !important;
        }

        .mini-toggle-switch {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 20px;
        }

        .mini-toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .mini-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .3s;
          border-radius: 20px;
        }

        .mini-toggle-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }

        .mini-toggle-switch input:checked + .mini-toggle-slider {
          background-color: #423257;
        }

        .mini-toggle-switch input:checked + .mini-toggle-slider:before {
          transform: translateX(20px);
        }

        .nav-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
        }

        .nav-left {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .nav-brand {
          font-size: 1.5rem;
          font-weight: bold;
          color: #423257;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .nav-brand:hover {
          color: #533d6a;
        }

        .nav-toggle {
          display: none;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.9);
          font-size: 1.2rem;
          cursor: pointer;
          padding: 5px 8px;
          line-height: 1;
          box-shadow: none;
          outline: none;
        }

        .nav-toggle:focus,
        .nav-toggle:active {
          box-shadow: none;
          outline: none;
        }

        .nav-links {
          display: flex;
          gap: 25px;
          align-items: center;
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .nav-links li {
          margin: 0;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .nav-links a {
          color: rgba(255, 255, 255, 0.9);
          text-decoration: none;
          font-size: 1rem;
          padding: 8px 16px;
          border-radius: 8px;
          transition: all 0.3s ease;
          display: block;
        }

        .nav-links a:hover {
          background: rgba(66, 50, 87, 0.2);
          color: #423257;
        }

        .nav-links a.active {
          background: rgba(66, 50, 87, 0.3);
          color: #423257;
        }

        .nav-logout {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444 !important;
          border: 1px solid rgba(239, 68, 68, 0.3);
          cursor: pointer;
        }

        .nav-logout:hover {
          background: rgba(239, 68, 68, 0.3);
          color: #ff5555 !important;
        }

        /* Mobile styles */
        @media (max-width: 768px) {
          .nav-toggle {
            display: block;
            order: -1;
          }

          .nav-right {
            gap: 10px;
          }

          .nav-logout-btn {
            font-size: 0.85rem;
            padding: 6px 12px;
          }

          .nav-links {
            position: fixed;
            top: 0;
            left: -100%;
            height: 100vh;
            width: 280px;
            background: rgba(26, 26, 46, 0.98);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            flex-direction: column;
            align-items: flex-start;
            padding: 30px 20px 20px 20px;
            gap: 5px;
            transition: left 0.3s ease;
            box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
            z-index: 1001;
          }

          .nav-links.active {
            left: 0;
          }

          .nav-links li {
            width: 100%;
          }

          .nav-links a {
            width: 100%;
            padding: 12px 16px;
            white-space: nowrap;
          }

          .nav-brand {
            font-size: 1.2rem;
          }
        }

        /* Desktop spacing for content */
        @media (min-width: 769px) {
          body {
            padding-top: 70px;
          }
        }

        @media (max-width: 768px) {
          body {
            padding-top: 60px;
          }
        }
      </style>

      <div id="nav-overlay"></div>
      
      <nav id="main-nav" class="${isTestMode ? 'test-mode' : ''}">
        <div class="nav-container">
          <div class="nav-left">
            <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
              ☰
            </button>
            <span class="test-mode-badge">TEST</span>
          </div>

          <ul class="nav-links" id="nav-links">
            <li><a href="/" data-page="home">Events</a></li>
            
            ${loggedIn ? `
              <li><a href="/admin" data-page="admin">Event Management</a></li>
              <li><a href="/scan" data-page="scan">Scan Tickets</a></li>
            ` : ''}
          </ul>

          <div class="nav-right">
            <div class="test-mode-toggle-nav ${loggedIn ? 'show' : ''}" id="test-mode-toggle-nav">
              <label for="nav-test-mode-switch">Test</label>
              <label class="mini-toggle-switch">
                <input type="checkbox" id="nav-test-mode-switch" ${isTestMode ? 'checked' : ''}>
                <span class="mini-toggle-slider"></span>
              </label>
            </div>
            <button class="nav-logout-btn ${loggedIn ? 'show' : ''}" id="nav-logout-btn">Logout</button>
          </div>
        </div>
      </nav>
    `;

    // Insert nav at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', navHTML);
  }

  // Set active link based on current page
  function setActivePage() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.nav-links a[data-page]');
    
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href === path || (path === '/' && href === '/')) {
        link.classList.add('active');
      } else if (path.includes(href) && href !== '/') {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Initialize navigation
  function initNav() {
    createNav();
    setActivePage();

    // Mobile menu toggle
    const navToggle = document.getElementById('nav-toggle');
    const navClose = document.getElementById('nav-close');
    const navLinks = document.getElementById('nav-links');
    const navOverlay = document.getElementById('nav-overlay');

    function openMenu() {
      navLinks.classList.add('active');
      navOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      navLinks.classList.remove('active');
      navOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    navToggle?.addEventListener('click', openMenu);
    navClose?.addEventListener('click', closeMenu);
    navOverlay?.addEventListener('click', closeMenu);

    // Close menu when clicking a link on mobile
    const links = navLinks.querySelectorAll('a:not(.nav-logout)');
    links.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Logout functionality
    const logoutBtn = document.getElementById('nav-logout-btn');
    logoutBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      showConfirm('Are you sure you want to logout?', () => {
        sessionStorage.removeItem('adminPassword');
        sessionStorage.removeItem('scanStats');
        sessionStorage.removeItem('testMode');
        window.location.href = '/';
      });
    });

    // Test mode toggle functionality
    const testModeToggle = document.getElementById('nav-test-mode-switch');
    testModeToggle?.addEventListener('change', (e) => {
      const isTestMode = e.target.checked;
      sessionStorage.setItem('testMode', isTestMode ? 'true' : 'false');
      updateTestModeBanner();
      
      // Show toast notification
      showNavToast(
        isTestMode ? 'Test mode enabled' : 'Test mode disabled',
        'success'
      );
    });
  }

  // Simple toast notification for nav (matches Toastify style)
  function showNavToast(message, type = 'success') {
    const toast = document.createElement('div');
    
    let bgColor;
    let textColor;
    if (type === 'success') {
      bgColor = 'linear-gradient(135deg, rgba(78, 205, 196, 0.95), rgba(68, 169, 160, 0.95))';
      textColor = '#000';
    } else {
      bgColor = 'rgba(26, 26, 26, 0.95)';
      textColor = '#fff';
    }
    
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${bgColor};
      backdrop-filter: blur(10px);
      color: ${textColor};
      padding: 15px 24px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      z-index: 10001;
      max-width: calc(100vw - 40px);
      min-width: 300px;
      text-align: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      cursor: pointer;
    `;
    toast.textContent = message;
    
    // Dismiss on click
    toast.onclick = () => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    };
    
    document.body.appendChild(toast);

    // Add responsive width for desktop
    if (window.innerWidth > 768) {
      toast.style.minWidth = '400px';
    }

    // Auto dismiss after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

  // Custom confirmation dialog
  function showConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10002;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: rgba(26, 26, 46, 0.98);
      backdrop-filter: blur(15px);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 15px;
      padding: 30px;
      max-width: 400px;
      width: calc(100vw - 40px);
      text-align: center;
    `;

    const text = document.createElement('p');
    text.style.cssText = `
      color: #fff;
      font-size: 16px;
      margin: 0 0 20px 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    text.textContent = message;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: center;
    `;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 24px;
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    cancelBtn.onclick = () => overlay.remove();

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Logout';
    confirmBtn.style.cssText = `
      padding: 10px 24px;
      background: #ef4444;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    `;
    confirmBtn.onclick = () => {
      overlay.remove();
      onConfirm();
    };

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
    dialog.appendChild(text);
    dialog.appendChild(btnContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  // Update test mode nav bar
  function updateTestModeBanner() {
    const isTestMode = sessionStorage.getItem('testMode') === 'true';
    const nav = document.getElementById('main-nav');
    const toggle = document.getElementById('nav-test-mode-switch');
    
    if (nav) {
      if (isTestMode) {
        nav.classList.add('test-mode');
      } else {
        nav.classList.remove('test-mode');
      }
    }

    if (toggle) {
      toggle.checked = isTestMode;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }

  // Update test mode banner after nav is created
  setTimeout(updateTestModeBanner, 0);

  // Export for use in other scripts if needed
  window.WizardNav = {
    isLoggedIn: isLoggedIn,
    refresh: function() {
      const oldNav = document.getElementById('main-nav');
      const oldOverlay = document.getElementById('nav-overlay');
      if (oldNav) oldNav.remove();
      if (oldOverlay) oldOverlay.remove();
      initNav();
      setTimeout(updateTestModeBanner, 0);
    },
    updateTestModeBanner: updateTestModeBanner
  };
})();
