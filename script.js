/**
 * YELO Music - Main Script
 * Home, Artists, Favorites with Mini Player
 */
(function() {
    'use strict';

    // ===== State =====
    let allSongs = [];
    let currentTab = 'home';
    let currentPlaylist = [];
    let currentIndex = 0;
    let audio = null;
    let isPlaying = false;
    let loopEnabled = false;
    let favorites = JSON.parse(localStorage.getItem('yelo_favorites') || '[]');
    let currentFilter = '';
    let artistFilter = '';
    let isDragging = false;
    let isArtistView = false;

    // ===== DOM refs =====
    const songGrid = document.getElementById('songGrid');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');
    const tabs = document.querySelectorAll('.tab-btn');

    // Mini Player
    const miniPlayer = document.getElementById('miniPlayer');
    const miniCover = document.getElementById('miniCover');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const miniPlay = document.getElementById('miniPlay');
    const miniPrev = document.getElementById('miniPrev');
    const miniNext = document.getElementById('miniNext');
    const miniLike = document.getElementById('miniLike');
    const miniLoop = document.getElementById('miniLoop');
    const miniDownload = document.getElementById('miniDownload');
    const miniProgressFill = document.getElementById('miniProgressFill');
    const miniProgressBar = document.getElementById('miniProgressBar');
    const miniCurrentTime = document.getElementById('miniCurrentTime');
    const miniTotalTime = document.getElementById('miniTotalTime');

    // ===== Helpers =====
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function isFavorite(id) {
        return favorites.includes(id);
    }

    function toggleFavorite(id) {
        const idx = favorites.indexOf(id);
        if (idx > -1) {
            favorites.splice(idx, 1);
        } else {
            favorites.push(id);
        }
        localStorage.setItem('yelo_favorites', JSON.stringify(favorites));
        renderCurrentView();
        updateMiniLikeButton();
    }

    function getArtists() {
        const artistMap = {};
        allSongs.forEach(song => {
            if (!artistMap[song.artist]) {
                artistMap[song.artist] = [];
            }
            artistMap[song.artist].push(song);
        });
        return artistMap;
    }

    // ===== MediaSession =====
    function updateMediaSession(song) {
        if (!song) return;
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.title || 'Unknown Title',
                artist: song.artist || 'Unknown Artist',
                artwork: [
                    { src: song.cover || '', sizes: '512x512', type: 'image/jpeg' },
                    { src: song.cover || '', sizes: '256x256', type: 'image/jpeg' },
                ]
            });

            navigator.mediaSession.setActionHandler('play', () => {
                if (audio) {
                    audio.play().catch(() => {});
                    isPlaying = true;
                    updateMiniPlayButton();
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'playing';
                    }
                }
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                if (audio) {
                    audio.pause();
                    isPlaying = false;
                    updateMiniPlayButton();
                    if ('mediaSession' in navigator) {
                        navigator.mediaSession.playbackState = 'paused';
                    }
                }
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                playPrev();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                playNext();
            });
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (audio && details.seekTime !== undefined) {
                    audio.currentTime = details.seekTime;
                }
            });
        }
    }

    // ===== Load data =====
    async function loadSongs() {
        try {
            const resp = await fetch('./art.json');
            if (!resp.ok) throw new Error('art.json not found.');
            allSongs = await resp.json();
            if (!allSongs.length) throw new Error('No songs available.');
            renderCurrentView();
        } catch (err) {
            console.error(err);
            songGrid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);font-family:var(--font-family);">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:12px;display:block;"></i>
                    <p>Error loading songs.</p>
                </div>
            `;
        }
    }

    // ===== Render =====
    function getFilteredSongs() {
        let songs = allSongs;

        if (artistFilter) {
            songs = songs.filter(s => s.artist === artistFilter);
        }

        if (currentTab === 'favorites') {
            songs = songs.filter(s => isFavorite(s.id));
        }

        if (currentFilter) {
            const q = currentFilter.toLowerCase();
            songs = songs.filter(s =>
                s.title.toLowerCase().includes(q) ||
                s.artist.toLowerCase().includes(q)
            );
        }

        return songs;
    }

    function renderCurrentView() {
        // Check if we're in artist filter mode (showing songs of a specific artist)
        if (artistFilter && currentTab === 'artists') {
            // Show filtered songs but keep artists tab active
            const songs = getFilteredSongs();
            if (!songs || !songs.length) {
                songGrid.innerHTML = '';
                noResults.style.display = 'block';
                return;
            }
            noResults.style.display = 'none';
            renderSongs(songs);
            return;
        }

        if (currentTab === 'artists') {
            renderArtists();
            return;
        }

        const songs = getFilteredSongs();
        if (!songs || !songs.length) {
            songGrid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        noResults.style.display = 'none';
        renderSongs(songs);
    }

    function renderSongs(songs) {
        let html = '';
        songs.forEach(song => {
            const fav = isFavorite(song.id);
            html += `
                <div class="song-card" data-id="${song.id}">
                    <img src="${escapeHTML(song.cover)}" alt="${escapeHTML(song.title)}" class="song-card-cover" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%236c6c70%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22 font-size=%2240%22 font-family=%22sans-serif%22%3E🎵%3C/text%3E%3C/svg%3E'">
                    <button class="favorite-btn ${fav ? 'active' : ''}" data-id="${song.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                    <div class="song-card-info">
                        <div class="song-card-title">${escapeHTML(song.title)}</div>
                        <div class="song-card-artist">${escapeHTML(song.artist)}</div>
                        ${song.hasMusic ? `<span class="song-card-badge">music</span>` : ''}
                        ${song.hasVideo ? `<span class="song-card-badge">video</span>` : ''}
                    </div>
                </div>
            `;
        });
        songGrid.innerHTML = html;

        document.querySelectorAll('.song-card').forEach(card => {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.favorite-btn')) return;
                const id = parseInt(this.dataset.id);
                const songsList = getFilteredSongs();
                const idx = songsList.findIndex(s => s.id === id);
                if (idx > -1) {
                    currentPlaylist = songsList;
                    currentIndex = idx;
                    playSong(currentIndex);
                }
            });
        });

        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = parseInt(this.dataset.id);
                toggleFavorite(id);
            });
        });
    }

    function renderArtists() {
        const artistMap = getArtists();
        const artistNames = Object.keys(artistMap);

        if (!artistNames.length) {
            songGrid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        noResults.style.display = 'none';

        let html = '<div class="artist-grid">';
        artistNames.forEach(name => {
            const songs = artistMap[name];
            const randomCover = songs[Math.floor(Math.random() * songs.length)].cover;
            html += `
                <div class="artist-card" data-artist="${escapeHTML(name)}">
                    <img src="${escapeHTML(randomCover)}" alt="${escapeHTML(name)}" class="artist-card-cover" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%236c6c70%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22 font-size=%2240%22 font-family=%22sans-serif%22%3E🎤%3C/text%3E%3C/svg%3E'">
                    <div class="artist-card-name">
                        ${escapeHTML(name)}
                        <div class="artist-card-count">${songs.length} songs</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        songGrid.innerHTML = html;

        document.querySelectorAll('.artist-card').forEach(card => {
            card.addEventListener('click', function() {
                artistFilter = this.dataset.artist;
                currentTab = 'artists';
                // Keep artists tab active
                updateTabs();
                // Render filtered songs
                const songs = getFilteredSongs();
                if (!songs || !songs.length) {
                    songGrid.innerHTML = '';
                    noResults.style.display = 'block';
                    return;
                }
                noResults.style.display = 'none';
                renderSongs(songs);
                searchInput.value = '';
                currentFilter = '';
                clearBtn.style.display = 'none';
            });
        });
    }

    function updateTabs() {
        tabs.forEach(tab => {
            const tabName = tab.dataset.tab;
            if (artistFilter && tabName === 'artists') {
                tab.classList.add('active');
            } else if (!artistFilter && tabName === currentTab) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    // ===== Player =====
    function playSong(index) {
        if (!currentPlaylist.length) return;
        if (index < 0) index = currentPlaylist.length - 1;
        if (index >= currentPlaylist.length) index = 0;

        currentIndex = index;
        const song = currentPlaylist[index];
        if (!song || !song.hasMusic) return;

        if (audio) {
            audio.pause();
            audio.src = '';
        }

        audio = new Audio(song.music);
        audio.volume = 0.8;
        audio.loop = false;

        audio.addEventListener('loadedmetadata', () => {
            miniTotalTime.textContent = formatTime(audio.duration);
        });

        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const percent = (audio.currentTime / audio.duration) * 100;
                miniProgressFill.style.width = percent + '%';
                miniCurrentTime.textContent = formatTime(audio.currentTime);
            }
        });

        audio.addEventListener('ended', () => {
            if (loopEnabled) {
                audio.currentTime = 0;
                audio.play().catch(() => {});
            } else {
                isPlaying = false;
                updateMiniPlayButton();
                playNext();
            }
        });

        audio.play().catch(() => {});
        isPlaying = true;

        miniCover.src = song.cover;
        miniTitle.textContent = song.title;
        miniArtist.textContent = song.artist;
        miniDownload.href = song.music;
        miniPlayer.classList.add('active');
        updateMiniPlayButton();
        updateMiniLikeButton();
        updateMiniLoopButton();

        // Update MediaSession
        updateMediaSession(song);
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
        }
    }

    function togglePlay() {
        if (!audio) return;
        if (isPlaying) {
            audio.pause();
            isPlaying = false;
        } else {
            audio.play().catch(() => {});
            isPlaying = true;
        }
        updateMiniPlayButton();
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        }
    }

    function playPrev() {
        if (!currentPlaylist.length) return;
        const newIndex = currentIndex - 1 < 0 ? currentPlaylist.length - 1 : currentIndex - 1;
        playSong(newIndex);
    }

    function playNext() {
        if (!currentPlaylist.length) return;
        const newIndex = currentIndex + 1 >= currentPlaylist.length ? 0 : currentIndex + 1;
        playSong(newIndex);
    }

    function updateMiniPlayButton() {
        miniPlay.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    }

    function updateMiniLikeButton() {
        if (currentPlaylist.length && currentPlaylist[currentIndex]) {
            const fav = isFavorite(currentPlaylist[currentIndex].id);
            miniLike.classList.toggle('active', fav);
        }
    }

    function updateMiniLoopButton() {
        miniLoop.classList.toggle('active', loopEnabled);
    }

    // ===== Mini Progress Dragging (Touch & Mouse) =====
    function setMiniProgress(clientX) {
        const rect = miniProgressBar.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const percent = rect.width > 0 ? x / rect.width : 0;
        miniProgressFill.style.width = (percent * 100) + '%';
        if (audio && audio.duration) {
            audio.currentTime = percent * audio.duration;
        }
    }

    miniProgressBar.addEventListener('mousedown', function(e) {
        isDragging = true;
        this.classList.add('dragging');
        setMiniProgress(e.clientX);
    });

    document.addEventListener('mousemove', function(e) {
        if (isDragging) {
            setMiniProgress(e.clientX);
        }
    });

    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            miniProgressBar.classList.remove('dragging');
        }
    });

    miniProgressBar.addEventListener('touchstart', function(e) {
        e.preventDefault();
        const touch = e.touches[0];
        isDragging = true;
        this.classList.add('dragging');
        setMiniProgress(touch.clientX);
    }, { passive: false });

    miniProgressBar.addEventListener('touchmove', function(e) {
        e.preventDefault();
        if (isDragging) {
            const touch = e.touches[0];
            setMiniProgress(touch.clientX);
        }
    }, { passive: false });

    miniProgressBar.addEventListener('touchend', function() {
        isDragging = false;
        this.classList.remove('dragging');
    });

    // ===== Mini Player Events =====
    miniPlay.addEventListener('click', togglePlay);
    miniPrev.addEventListener('click', playPrev);
    miniNext.addEventListener('click', playNext);

    miniLike.addEventListener('click', function() {
        if (currentPlaylist.length && currentPlaylist[currentIndex]) {
            toggleFavorite(currentPlaylist[currentIndex].id);
        }
    });

    miniLoop.addEventListener('click', function() {
        loopEnabled = !loopEnabled;
        updateMiniLoopButton();
    });

    // ===== Tabs =====
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            currentTab = tabName;
            artistFilter = '';
            updateTabs();
            renderCurrentView();
            searchInput.value = '';
            currentFilter = '';
            clearBtn.style.display = 'none';
        });
    });

    // ===== Search =====
    searchInput.addEventListener('input', function() {
        currentFilter = this.value.trim();
        clearBtn.style.display = currentFilter ? 'block' : 'none';
        if (currentTab === 'artists' && !artistFilter) {
            currentTab = 'home';
            updateTabs();
        }
        renderCurrentView();
    });

    clearBtn.addEventListener('click', function() {
        searchInput.value = '';
        currentFilter = '';
        clearBtn.style.display = 'none';
        renderCurrentView();
        searchInput.focus();
    });

    // ===== Start =====
    loadSongs();

})();
