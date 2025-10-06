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
        }

        .nav-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 20px;
        }

        .nav-left {
          margin-right: auto;
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .nav-brand {
          font-size: 1.5rem;
          font-weight: bold;
          color: #4ecdc4;
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .nav-brand:hover {
          color: #3db5ac;
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
          background: rgba(78, 205, 196, 0.2);
          color: #4ecdc4;
        }

        .nav-links a.active {
          background: rgba(78, 205, 196, 0.3);
          color: #4ecdc4;
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
            z-index: 1000;
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
      
      <nav id="main-nav">
        <div class="nav-container">
          <div class="nav-left">
            <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
              ☰
            </button>
          </div>

          <ul class="nav-links" id="nav-links">
            <li><a href="/" data-page="home">Events</a></li>
            <li><a href="/about" data-page="about">About</a></li>
            
            ${loggedIn ? `
              <li><a href="/admin" data-page="admin">Event Management</a></li>
              <li><a href="/scan" data-page="scan">Scan Tickets</a></li>
              <li><a href="#" class="nav-logout" id="nav-logout">Logout</a></li>
            ` : ''}
          </ul>
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
    const logoutBtn = document.getElementById('nav-logout');
    logoutBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('adminPassword');
        sessionStorage.removeItem('scanStats');
        window.location.href = '/';
      }
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }

  // Export for use in other scripts if needed
  window.WizardNav = {
    isLoggedIn: isLoggedIn,
    refresh: function() {
      const oldNav = document.getElementById('main-nav');
      const oldOverlay = document.getElementById('nav-overlay');
      if (oldNav) oldNav.remove();
      if (oldOverlay) oldOverlay.remove();
      initNav();
    }
  };
})();
