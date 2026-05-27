/**
 * Farava Music Label — Main Script
 * Dynamic song grid with live search
 */
(function () {
    'use strict';

    const songGrid = document.getElementById('songGrid');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');

    let allSongs = [];
    let currentQuery = '';

    // ========== بارگذاری داده‌ها ==========
    async function loadSongs() {
        try {
            const response = await fetch('./art.json');
            if (!response.ok) throw new Error('فایل art.json یافت نشد.');
            allSongs = await response.json();
            renderSongs(allSongs);
        } catch (error) {
            console.error('خطا در بارگذاری:', error);
            songGrid.innerHTML = '<div class="no-results"><i class="fas fa-exclamation-triangle"></i><p>خطا در بارگذاری اطلاعات.</p></div>';
        }
    }

    // ========== جستجوی زنده ==========
    function filterSongs(query) {
        if (!query.trim()) return allSongs;

        const q = query.trim().toLowerCase();
        return allSongs.filter(song => {
            const title = (song.title || '').toLowerCase();
            const artist = (song.artist || '').toLowerCase();
            const desc = (song.description || '').toLowerCase();
            return title.includes(q) || artist.includes(q) || desc.includes(q);
        });
    }

    function renderSongs(songs) {
        if (!songGrid) return;

        if (songs.length === 0) {
            songGrid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }

        noResults.style.display = 'none';
        songGrid.innerHTML = songs.map(song => `
            <a href="./song.html?id=${song.id}" class="song-card">
                <img 
                    src="${song.cover}" 
                    alt="${song.title}" 
                    class="card-cover"
                    loading="lazy"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><rect fill=%22%23161b22%22 width=%22200%22 height=%22200%22/><text fill=%22%236e7681%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>بدون کاور</text></svg>'"
                >
                <div class="card-info">
                    <div class="card-title">${escapeHTML(song.title)}</div>
                    <div class="card-artist">${escapeHTML(song.artist)}</div>
                </div>
            </a>
        `).join('');
    }

    // ========== جلوگیری از XSS ==========
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== رویدادها ==========
    searchInput.addEventListener('input', function () {
        currentQuery = this.value;
        clearBtn.style.display = currentQuery ? 'block' : 'none';
        const filtered = filterSongs(currentQuery);
        renderSongs(filtered);
    });

    clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        currentQuery = '';
        clearBtn.style.display = 'none';
        renderSongs(allSongs);
        searchInput.focus();
    });

    // ========== شروع ==========
    loadSongs();
})();
