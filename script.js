/**
 * YELO Music - Optimized Player
 */
(function () {
    'use strict';

    let allSongs = [];
    let currentTab = 'home';
    let currentPlaylist = [];
    let currentIndex = 0;
    let audio = null;
    let isPlaying = false;
    let loopEnabled = false;
    let shuffleEnabled = false;
    let favorites = JSON.parse(localStorage.getItem('yelo_favorites') || '[]');
    let recent = JSON.parse(localStorage.getItem('yelo_recent') || '[]');
    let currentFilter = '';
    let artistFilter = '';
    let isDragging = false;
    let volume = parseFloat(localStorage.getItem('yelo_volume') || '1');
    let displayIdleTimer = null;
    let isDisplayMode = false;

    function initTheme() {
        const saved = localStorage.getItem('yelo_theme') || 'light';
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add('theme-' + saved);
        updateThemeIcon(saved);
    }
    function updateThemeIcon(theme) {
        const btn = document.getElementById('themeToggle');
        if (!btn) return;
        btn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }
    function toggleTheme() {
        const isDark = document.body.classList.contains('theme-dark');
        const next = isDark ? 'light' : 'dark';
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add('theme-' + next);
        localStorage.setItem('yelo_theme', next);
        updateThemeIcon(next);
    }


    function syncsafe(b0, b1, b2, b3) {
        return ((b0 & 127) << 21) | ((b1 & 127) << 14) | ((b2 & 127) << 7) | (b3 & 127);
    }
    function be32(b0, b1, b2, b3) {
        return ((b0 & 255) << 24) | ((b1 & 255) << 16) | ((b2 & 255) << 8) | (b3 & 255);
    }
    function readCString(bytes, start) {
        var i = start;
        while (i < bytes.length && bytes[i] !== 0) i++;
        return i + 1;
    }
    function pictureFromAPIC(data) {
        if (!data || data.length < 4) return null;
        var enc = data[0];
        var i = 1;
        var mime = '';
        while (i < data.length && data[i] !== 0) { mime += String.fromCharCode(data[i]); i++; }
        i++;
        if (i >= data.length) return null;
        i++;
        if (enc === 1 || enc === 2) {
            while (i + 1 < data.length && !(data[i] === 0 && data[i + 1] === 0)) i += 2;
            i += 2;
        } else {
            i = readCString(data, i);
        }
        if (i >= data.length) return null;
        var img = data.subarray(i);
        if (img.length < 8) return null;
        return new Blob([img], { type: mime || 'image/jpeg' });
    }
    function extractEmbeddedCover(url) {
        return fetch(url, { headers: { Range: 'bytes=0-9' } }).then(function (res) {
            if (!res.ok && res.status !== 206) return null;
            return res.arrayBuffer();
        }).then(function (headBuf) {
            if (!headBuf) return null;
            var head = new Uint8Array(headBuf);
            if (head.length < 10 || head[0] !== 73 || head[1] !== 68 || head[2] !== 51) return null;
            var ver = head[3];
            var tagSize = syncsafe(head[6], head[7], head[8], head[9]);
            var total = Math.min(10 + tagSize, 1572864);
            return fetch(url, { headers: { Range: 'bytes=0-' + (total - 1) } }).then(function (res) {
                if (!res.ok && res.status !== 206) return null;
                return res.arrayBuffer();
            }).then(function (buf) {
                if (!buf) return null;
                var bytes = new Uint8Array(buf);
                var end = Math.min(bytes.length, 10 + tagSize);
                var pos = 10;
                if (bytes[5] & 64) {
                    var ext = ver === 4 ? syncsafe(bytes[10], bytes[11], bytes[12], bytes[13]) : be32(bytes[10], bytes[11], bytes[12], bytes[13]);
                    pos = 10 + ext;
                }
                if (ver === 2) {
                    while (pos + 6 < end) {
                        var id2 = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2]);
                        if (id2 === '\u0000\u0000\u0000') break;
                        var size2 = (bytes[pos + 3] << 16) | (bytes[pos + 4] << 8) | bytes[pos + 5];
                        var start2 = pos + 6;
                        if (size2 <= 0 || start2 + size2 > end) break;
                        if (id2 === 'PIC') {
                            var pic = bytes.subarray(start2, start2 + size2);
                            var j = 1;
                            var fmt = String.fromCharCode(pic[j] || 0, pic[j + 1] || 0, pic[j + 2] || 0);
                            j += 4;
                            j = readCString(pic, j);
                            if (j < pic.length) {
                                var blob2 = new Blob([pic.subarray(j)], { type: fmt === 'PNG' ? 'image/png' : 'image/jpeg' });
                                return URL.createObjectURL(blob2);
                            }
                        }
                        pos = start2 + size2;
                    }
                    return null;
                }
                while (pos + 10 < end) {
                    var id = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
                    if (id === '\u0000\u0000\u0000\u0000' || !/^[A-Z0-9]{4}$/.test(id)) break;
                    var frameSize = ver === 4 ? syncsafe(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]) : be32(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
                    var dataStart = pos + 10;
                    if (frameSize <= 0 || dataStart + frameSize > end) break;
                    if (id === 'APIC') {
                        var blob = pictureFromAPIC(bytes.subarray(dataStart, dataStart + frameSize));
                        return blob ? URL.createObjectURL(blob) : null;
                    }
                    pos = dataStart + frameSize;
                }
                return null;
            });
        }).catch(function () { return null; });
    }
    function paintCover(song) {
        var url = song.cover || 'logo.jpg';
        document.querySelectorAll('img[data-cover-for="' + song.id + '"]').forEach(function (img) { img.src = url; });
        var current = currentPlaylist[currentIndex];
        if (!current || current.id !== song.id) return;
        if (miniCover) miniCover.src = url;
        if (fullCover) fullCover.src = url;
        if (displayCover) displayCover.src = url;
        if (displayBlur) displayBlur.style.backgroundImage = 'url("' + url + '")';
        updateMediaSession(song);
    }
    function hydrateCovers(songs) {
        var queue = (songs || []).filter(function (s) { return s && s.music && !s._coverTried; });
        var active = 0;
        function pump() {
            while (active < 3 && queue.length) {
                (function (song) {
                    song._coverTried = true;
                    active++;
                    extractEmbeddedCover(song.music).then(function (url) {
                        if (url) { song.cover = url; paintCover(song); }
                    }).finally(function () { active--; pump(); });
                })(queue.shift());
            }
        }
        pump();
    }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
    function formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function isFavorite(id) { return favorites.includes(String(id)); }
    function toggleFavorite(id) {
        id = String(id);
        const idx = favorites.indexOf(id);
        if (idx > -1) favorites.splice(idx, 1);
        else favorites.push(id);
        localStorage.setItem('yelo_favorites', JSON.stringify(favorites));
        renderCurrentView();
        updateLikeButtons();
    }
    function addToRecent(song) {
        if (!song || !song.id) return;
        recent = recent.filter(id => id !== song.id);
        recent.unshift(song.id);
        if (recent.length > 30) recent = recent.slice(0, 30);
        localStorage.setItem('yelo_recent', JSON.stringify(recent));
    }
    function getArtists() {
        const map = {};
        allSongs.forEach(song => {
            const a = song.artist || 'Unknown';
            if (!map[a]) map[a] = [];
            map[a].push(song);
        });
        return map;
    }

    function extractColors(imgUrl, callback) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            try {
                const canvas = document.createElement('canvas');
                const size = 24;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 32) {
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
                }
                r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
                callback({
                    dark: 'rgb(' + Math.round(r * 0.25) + ',' + Math.round(g * 0.25) + ',' + Math.round(b * 0.25) + ')',
                    mid: 'rgb(' + Math.round(r * 0.45) + ',' + Math.round(g * 0.45) + ',' + Math.round(b * 0.45) + ')',
                    r: r, g: g, b: b
                });
            } catch (e) {
                callback({ dark: '#1a1510', mid: '#2a2018', r: 40, g: 30, b: 20 });
            }
        };
        img.onerror = function () {
            callback({ dark: '#1a1510', mid: '#2a2018', r: 40, g: 30, b: 20 });
        };
        img.src = imgUrl;
    }

    const songGrid = document.getElementById('songGrid');
    const noResults = document.getElementById('noResults');
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');
    const tabs = document.querySelectorAll('.tab-btn');

    const miniPlayer = document.getElementById('miniPlayer');
    const miniCover = document.getElementById('miniCover');
    const miniTitle = document.getElementById('miniTitle');
    const miniArtist = document.getElementById('miniArtist');
    const miniPlay = document.getElementById('miniPlay');
    const miniPrev = document.getElementById('miniPrev');
    const miniNext = document.getElementById('miniNext');
    const miniLike = document.getElementById('miniLike');
    const miniLoop = document.getElementById('miniLoop');
    const miniShuffle = document.getElementById('miniShuffle');
    const miniDownload = document.getElementById('miniDownload');
    const miniExpand = document.getElementById('miniExpand');
    const miniDisplay = document.getElementById('miniDisplay');
    const miniProgressFill = document.getElementById('miniProgressFill');
    const miniProgressBar = document.getElementById('miniProgressBar');
    const miniCurrentTime = document.getElementById('miniCurrentTime');
    const miniTotalTime = document.getElementById('miniTotalTime');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');

    const fullPlayer = document.getElementById('fullPlayer');
    const fullCover = document.getElementById('fullCover');
    const fullTitle = document.getElementById('fullTitle');
    const fullArtist = document.getElementById('fullArtist');
    const fullPlay = document.getElementById('fullPlay');
    const fullPrev = document.getElementById('fullPrev');
    const fullNext = document.getElementById('fullNext');
    const fullLike = document.getElementById('fullLike');
    const fullLoop = document.getElementById('fullLoop');
    const fullShuffle = document.getElementById('fullShuffle');
    const fullDownload = document.getElementById('fullDownload');
    const fullDisplay = document.getElementById('fullDisplay');
    const fullProgressFill = document.getElementById('fullProgressFill');
    const fullProgressBar = document.getElementById('fullProgressBar');
    const fullCurrentTime = document.getElementById('fullCurrentTime');
    const fullTotalTime = document.getElementById('fullTotalTime');
    const fullVolumeSlider = document.getElementById('fullVolumeSlider');
    const fullClose = document.getElementById('fullClose');
    const fullBackdrop = document.getElementById('fullPlayerBackdrop');

    const displayMode = document.getElementById('displayMode');
    const displayBg = document.getElementById('displayBg');
    const displayBlur = document.getElementById('displayBlur');
    const displayCover = document.getElementById('displayCover');
    const displayTitle = document.getElementById('displayTitle');
    const displayArtist = document.getElementById('displayArtist');
    const displayPlay = document.getElementById('displayPlay');
    const displayPrev = document.getElementById('displayPrev');
    const displayNext = document.getElementById('displayNext');
    const displayExit = document.getElementById('displayExit');

    function renderSongs(songs) {
        if (!songs.length) { songGrid.innerHTML = ''; noResults.style.display = 'block'; return; }
        noResults.style.display = 'none';
        songGrid.className = 'song-grid';
        songGrid.innerHTML = songs.map(function (song) {
            return '<div class="song-card" data-id="' + song.id + '">' +
                '<button class="favorite-btn ' + (isFavorite(song.id) ? 'active' : '') + '" data-fav="' + song.id + '" type="button"><i class="fas fa-heart"></i></button>' +
                '<img class="song-card-cover" data-cover-for="' + song.id + '" src="' + escapeHTML(song.cover || 'logo.jpg') + '" alt="" loading="lazy" onerror="this.src=\'logo.jpg\'">' +
                '<div class="song-card-info">' +
                '<div class="song-card-title">' + escapeHTML(song.title) + '</div>' +
                '<div class="song-card-artist">' + escapeHTML(song.artist) + '</div>' +
                '<span class="song-card-badge">MUSIC</span></div></div>';
        }).join('');
        songGrid.querySelectorAll('.song-card').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('.favorite-btn')) return;
                playSongById(card.dataset.id, songs);
            });
        });
        songGrid.querySelectorAll('.favorite-btn').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleFavorite(btn.dataset.fav);
            });
        });
    }

    function renderArtists() {
        var artists = getArtists();
        var keys = Object.keys(artists).sort();
        if (currentFilter) {
            var q = currentFilter.toLowerCase();
            keys = keys.filter(function (k) { return k.toLowerCase().indexOf(q) !== -1; });
        }
        if (!keys.length) { songGrid.innerHTML = ''; noResults.style.display = 'block'; return; }
        noResults.style.display = 'none';
        songGrid.className = 'artist-grid';
        songGrid.innerHTML = keys.map(function (name) {
            var list = artists[name];
            var first = list[0];
            var cover = first ? (first.cover || 'logo.jpg') : 'logo.jpg';
            return '<div class="artist-card" data-artist="' + escapeHTML(name) + '">' +
                '<img class="artist-card-cover" data-cover-for="' + (first ? first.id : '') + '" src="' + escapeHTML(cover) + '" alt="" loading="lazy" onerror="this.src=\'logo.jpg\'">' +
                '<div class="artist-card-name">' + escapeHTML(name) +
                '<span class="artist-card-count">' + list.length + ' song' + (list.length > 1 ? 's' : '') + '</span></div></div>';
        }).join('');
        songGrid.querySelectorAll('.artist-card').forEach(function (card) {
            card.addEventListener('click', function () {
                artistFilter = card.dataset.artist;
                currentTab = 'home';
                updateTabs();
                renderCurrentView();
            });
        });
    }

    function getFilteredSongs() {
        var list = allSongs.slice();
        if (currentTab === 'favorites') list = list.filter(function (s) { return isFavorite(s.id); });
        else if (currentTab === 'recent') list = recent.map(function (id) { return allSongs.find(function (s) { return String(s.id) === String(id); }); }).filter(Boolean);
        else if (artistFilter) list = list.filter(function (s) { return s.artist === artistFilter; });
        if (currentFilter) {
            var q = currentFilter.toLowerCase();
            list = list.filter(function (s) {
                return (s.title || '').toLowerCase().indexOf(q) !== -1 || (s.artist || '').toLowerCase().indexOf(q) !== -1;
            });
        }
        return list;
    }

    function renderCurrentView() {
        if (currentTab === 'artists' && !artistFilter) renderArtists();
        else renderSongs(getFilteredSongs());
    }

    function updateTabs() {
        tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.tab === currentTab); });
    }

    function ensureAudio() {
        if (!audio) {
            audio = new Audio();
            audio.volume = volume;
            audio.addEventListener('timeupdate', onTimeUpdate);
            audio.addEventListener('ended', onEnded);
            audio.addEventListener('loadedmetadata', onLoadedMeta);
            audio.addEventListener('play', function () { isPlaying = true; updatePlayButtons(); });
            audio.addEventListener('pause', function () { isPlaying = false; updatePlayButtons(); });
        }
        return audio;
    }

    function playSongById(id, playlist) {
        var list = playlist && playlist.length ? playlist : allSongs;
        var sid = String(id);
        var idx = list.findIndex(function (s) { return String(s.id) === sid; });
        if (idx < 0) return;
        currentPlaylist = list;
        currentIndex = idx;
        playCurrent();
    }

    function playCurrent() {
        var song = currentPlaylist[currentIndex];
        if (!song) return;
        var a = ensureAudio();
        a.src = song.music;
        a.volume = volume;
        a.play().catch(function () {});
        isPlaying = true;
        addToRecent(song);
        showMiniPlayer(song);
        updateFullPlayer(song);
        updateDisplayPlayer(song);
        updateMediaSession(song);
        updatePlayButtons();
        updateLikeButtons();
        updateLoopButtons();
        updateShuffleButtons();
    }

    function togglePlay() {
        if (!audio || !currentPlaylist.length) return;
        if (isPlaying) audio.pause();
        else audio.play().catch(function () {});
    }

    function playNext() {
        if (!currentPlaylist.length) return;
        if (shuffleEnabled) currentIndex = Math.floor(Math.random() * currentPlaylist.length);
        else currentIndex = (currentIndex + 1) % currentPlaylist.length;
        playCurrent();
    }

    function playPrev() {
        if (!currentPlaylist.length) return;
        if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
        currentIndex = (currentIndex - 1 + currentPlaylist.length) % currentPlaylist.length;
        playCurrent();
    }

    function onTimeUpdate() {
        if (!audio || isDragging) return;
        var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        miniProgressFill.style.width = pct + '%';
        fullProgressFill.style.width = pct + '%';
        miniCurrentTime.textContent = formatTime(audio.currentTime);
        fullCurrentTime.textContent = formatTime(audio.currentTime);
    }

    function onLoadedMeta() {
        if (!audio) return;
        miniTotalTime.textContent = formatTime(audio.duration);
        fullTotalTime.textContent = formatTime(audio.duration);
    }

    function onEnded() {
        if (loopEnabled) { audio.currentTime = 0; audio.play().catch(function () {}); }
        else playNext();
    }

    function seekFromEvent(e, bar, fill) {
        if (!audio || !audio.duration) return;
        var rect = bar.getBoundingClientRect();
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        var pct = Math.max(0, Math.min(1, x / rect.width));
        audio.currentTime = pct * audio.duration;
        fill.style.width = (pct * 100) + '%';
    }

    function setupSeek(bar, fill) {
        var dragging = false;
        var start = function (e) { dragging = true; isDragging = true; seekFromEvent(e, bar, fill); };
        var move = function (e) { if (dragging) seekFromEvent(e, bar, fill); };
        var end = function () { dragging = false; isDragging = false; };
        bar.addEventListener('mousedown', start);
        bar.addEventListener('touchstart', start, { passive: true });
        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move, { passive: true });
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    }

    function showMiniPlayer(song) {
        miniPlayer.classList.add('active');
        miniCover.src = song.cover || 'logo.jpg';
        miniTitle.textContent = song.title || '-';
        miniArtist.textContent = song.artist || '-';
        miniDownload.href = song.music || '#';
        miniDownload.setAttribute('download', (song.title || 'track') + '.mp3');
    }

    function updateFullPlayer(song) {
        if (!song) return;
        fullCover.src = song.cover || 'logo.jpg';
        fullTitle.textContent = song.title || '-';
        fullArtist.textContent = song.artist || '-';
        fullDownload.href = song.music || '#';
        fullDownload.setAttribute('download', (song.title || 'track') + '.mp3');
    }

    function openFullPlayer() {
        var song = currentPlaylist[currentIndex];
        if (!song) return;
        updateFullPlayer(song);
        fullPlayer.classList.add('active');
        document.body.classList.add('no-scroll');
    }

    function closeFullPlayer() {
        fullPlayer.classList.remove('active');
        if (!isDisplayMode) document.body.classList.remove('no-scroll');
    }

    function updateDisplayPlayer(song) {
        if (!song || !displayCover) return;
        displayCover.src = song.cover || 'logo.jpg';
        displayTitle.textContent = song.title || '-';
        displayArtist.textContent = song.artist || '-';
        if (!isDisplayMode) return;
        displayBlur.style.backgroundImage = 'url("' + (song.cover || 'logo.jpg') + '")';
        extractColors(song.cover || 'logo.jpg', function (c) {
            displayBg.style.background = c.dark;
            displayBg.style.setProperty('--dm-c1', 'rgb(' + Math.min(255, c.r + 40) + ',' + Math.min(255, Math.round(c.g * 0.7)) + ',' + Math.round(c.b * 0.5) + ')');
            displayBg.style.setProperty('--dm-c2', 'rgb(' + Math.round(c.r * 0.5) + ',' + Math.min(255, c.g + 20) + ',' + Math.min(255, c.b + 40) + ')');
            displayBg.style.setProperty('--dm-c3', c.mid);
        });
    }

    function enterDisplayMode() {
        var song = currentPlaylist[currentIndex];
        if (!song) return;
        isDisplayMode = true;
        updateDisplayPlayer(song);
        closeFullPlayer();
        displayMode.classList.add('active');
        displayMode.classList.remove('controls-visible');
        document.body.classList.add('no-scroll');
        var el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        resetDisplayIdle();
    }

    function exitDisplayMode() {
        isDisplayMode = false;
        displayMode.classList.remove('active', 'controls-visible', 'show-cursor');
        document.body.classList.remove('no-scroll');
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
        clearTimeout(displayIdleTimer);
    }

    function showDisplayControls() {
        if (!isDisplayMode) return;
        displayMode.classList.add('controls-visible', 'show-cursor');
        resetDisplayIdle();
    }

    function hideDisplayControls() {
        if (!isDisplayMode) return;
        displayMode.classList.remove('controls-visible', 'show-cursor');
    }

    function resetDisplayIdle() {
        clearTimeout(displayIdleTimer);
        displayIdleTimer = setTimeout(hideDisplayControls, 3500);
    }

    function updatePlayButtons() {
        var icon = isPlaying ? 'fa-pause' : 'fa-play';
        miniPlay.innerHTML = '<i class="fas ' + icon + '"></i>';
        fullPlay.innerHTML = '<i class="fas ' + icon + '"></i>';
        displayPlay.innerHTML = '<i class="fas ' + icon + '"></i>';
    }

    function updateLikeButtons() {
        var song = currentPlaylist[currentIndex];
        var active = song && isFavorite(song.id);
        miniLike.classList.toggle('active', !!active);
        fullLike.classList.toggle('active', !!active);
        fullLike.innerHTML = active ? '<i class="fas fa-heart"></i> Liked' : '<i class="fas fa-heart"></i> Like';
    }

    function updateLoopButtons() {
        miniLoop.classList.toggle('active', loopEnabled);
        fullLoop.classList.toggle('active', loopEnabled);
    }

    function updateShuffleButtons() {
        miniShuffle.classList.toggle('active', shuffleEnabled);
        fullShuffle.classList.toggle('active', shuffleEnabled);
    }

    function setVolume(v) {
        volume = Math.max(0, Math.min(1, v));
        if (audio) audio.volume = volume;
        volumeSlider.value = volume;
        fullVolumeSlider.value = volume;
        localStorage.setItem('yelo_volume', String(volume));
        if (volumeIcon) {
            volumeIcon.className = volume === 0 ? 'fas fa-volume-mute' : volume < 0.5 ? 'fas fa-volume-down' : 'fas fa-volume-up';
        }
    }

    function updateMediaSession(song) {
        if (!('mediaSession' in navigator) || !song) return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: song.title || 'Unknown',
            artist: song.artist || 'Unknown',
            artwork: [{ src: song.cover || '', sizes: '512x512', type: 'image/jpeg' }]
        });
        navigator.mediaSession.setActionHandler('play', function () { if (audio) audio.play().catch(function () {}); });
        navigator.mediaSession.setActionHandler('pause', function () { if (audio) audio.pause(); });
        navigator.mediaSession.setActionHandler('previoustrack', playPrev);
        navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }

    var AUDIO_EXT = /\.(mp3|wav|flac|m4a|ogg|aac|wma|opus)$/i;
    var IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i;
    var KNOWN_TRACKS = {
        inhalethethrone: { artist: 'Cho Young-Wuk', title: 'Inhale the Throne' },
        espersomaciato: { artist: 'Tommy', title: 'Esperso Maciyato' },
        edsheeranazizam: { artist: 'Ed Sheeran', title: 'Azizam' }
    };

    function stripMediaExt(name) {
        return String(name || '').replace(/\.(mp3|wav|flac|m4a|ogg|aac|wma|opus|jpg|jpeg|png|webp|gif|bmp|avif)$/i, '');
    }
    function cleanJunk(s) {
        s = String(s || '').replace(/[\u2013\u2014]/g, '-');
        s = s.replace(/\.mp3$/i, '');
        s = s.replace(/^\s*\d+[\.\-_]\s*/, '');
        s = s.replace(/[\(\[\{_\-\s]*(?:64|128|192|256|320)\s*(?:kbps)?[\)\]\}\_\-\s]*/gi, ' ');
        s = s.replace(/(?:www\.|https?:\/\/|@|telegram|t\.me)[\w\.\/\-]*/gi, ' ');
        return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-_.]+|[\s\-_.]+$/g, '');
    }
    function normKey(s) {
        return cleanJunk(stripMediaExt(s)).toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    function toTitle(s) {
        return String(s || '').replace(/\w\S*/g, function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).trim();
    }
    function parseSongName(fname) {
        var cleaned = cleanJunk(stripMediaExt(fname));
        var known = KNOWN_TRACKS[normKey(cleaned)];
        if (known) return known;
        var parts = cleaned.split(/\s+-\s*/);
        if (parts.length >= 2 && parts[0] && parts[1]) {
            return {
                artist: toTitle(parts[0].replace(/^E-d Sheeran$/i, 'Ed Sheeran')),
                title: toTitle(parts.slice(1).join(' - '))
            };
        }
        var bits = cleaned.split('-');
        if (bits.length >= 4 && cleaned.indexOf(' ') === -1) {
            return { artist: toTitle(bits.slice(0, 2).join(' ')), title: toTitle(bits.slice(2).join(' ')) };
        }
        return { artist: 'Unknown', title: toTitle(cleaned) };
    }
    function matchCover(artist, title, orig, covers) {
        var keys = [normKey(title), normKey(artist + ' ' + title), normKey(orig)];
        var i, c, tn;
        for (i = 0; i < covers.length; i++) {
            c = covers[i];
            if (keys.indexOf(c.norm) !== -1 || keys.indexOf(c.titleNorm) !== -1) return c.path;
        }
        tn = normKey(title);
        if (tn) {
            for (i = 0; i < covers.length; i++) {
                c = covers[i];
                if (c.norm.indexOf(tn) !== -1 || tn.indexOf(c.norm) !== -1 || c.titleNorm.indexOf(tn) !== -1) return c.path;
            }
        }
        return 'logo.jpg';
    }
    function uniqueId(artist, title, used) {
        var slug = normKey(artist + ' ' + title) || 'track';
        var base = slug, n = 2;
        while (used[slug]) { slug = base + n; n++; }
        used[slug] = true;
        return slug;
    }
    function buildLibrary(musicFiles, pictureFiles) {
        var covers = pictureFiles.filter(function (n) { return IMAGE_EXT.test(n); }).map(function (n) {
            var cleaned = cleanJunk(stripMediaExt(n));
            var titlePart = cleaned.indexOf('-') !== -1 ? cleaned.split('-').pop().trim() : cleaned;
            return { path: 'picture/' + n, norm: normKey(n), titleNorm: normKey(titlePart) };
        });
        var used = {};
        return musicFiles.filter(function (n) { return AUDIO_EXT.test(n); }).map(function (n) {
            var parsed = parseSongName(n);
            return {
                id: uniqueId(parsed.artist, parsed.title, used),
                title: parsed.title,
                artist: parsed.artist,
                cover: matchCover(parsed.artist, parsed.title, n, covers),
                music: 'music/' + n,
                hasMusic: true
            };
        });
    }
    function applySongs(data) {
        allSongs = (data || []).filter(function (s) { return s && s.hasMusic !== false && s.music; });
        renderCurrentView();
        hydrateCovers(allSongs);
        if (!allSongs.length) noResults.style.display = 'block';
    }
    function loadFromGitHubApi() {
        var repo = 'MHMahdavi1391/yelo';
        var opt = { headers: { Accept: 'application/vnd.github+json' } };
        return Promise.all([
            fetch('https://api.github.com/repos/' + repo + '/contents/music', opt).then(function (r) { return r.ok ? r.json() : []; }),
            fetch('https://api.github.com/repos/' + repo + '/contents/picture', opt).then(function (r) { return r.ok ? r.json() : []; })
        ]).then(function (res) {
            var music = (res[0] || []).filter(function (f) { return f && f.type === 'file'; }).map(function (f) { return f.name; });
            var pics = (res[1] || []).filter(function (f) { return f && f.type === 'file'; }).map(function (f) { return f.name; });
            applySongs(buildLibrary(music, pics));
        });
    }
    function loadSongs() {
        fetch('library.json').then(function (r) {
            if (!r.ok) throw new Error('no library');
            return r.json();
        }).then(function (data) {
            if (!data || !data.length) throw new Error('empty library');
            applySongs(data);
        }).catch(function () {
            loadFromGitHubApi().catch(function (err) {
                console.error(err);
                noResults.style.display = 'block';
            });
        });
    }

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            currentTab = this.dataset.tab;
            artistFilter = '';
            updateTabs();
            renderCurrentView();
            searchInput.value = '';
            currentFilter = '';
            clearBtn.style.display = 'none';
        });
    });
    searchInput.addEventListener('input', function () {
        currentFilter = this.value.trim();
        clearBtn.style.display = currentFilter ? 'block' : 'none';
        renderCurrentView();
    });
    clearBtn.addEventListener('click', function () {
        searchInput.value = '';
        currentFilter = '';
        clearBtn.style.display = 'none';
        renderCurrentView();
        searchInput.focus();
    });

    miniPlay.addEventListener('click', togglePlay);
    fullPlay.addEventListener('click', togglePlay);
    displayPlay.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });
    miniPrev.addEventListener('click', playPrev);
    fullPrev.addEventListener('click', playPrev);
    displayPrev.addEventListener('click', function (e) { e.stopPropagation(); playPrev(); });
    miniNext.addEventListener('click', playNext);
    fullNext.addEventListener('click', playNext);
    displayNext.addEventListener('click', function (e) { e.stopPropagation(); playNext(); });

    miniLoop.addEventListener('click', function () { loopEnabled = !loopEnabled; updateLoopButtons(); });
    fullLoop.addEventListener('click', function () { loopEnabled = !loopEnabled; updateLoopButtons(); });
    miniShuffle.addEventListener('click', function () { shuffleEnabled = !shuffleEnabled; updateShuffleButtons(); });
    fullShuffle.addEventListener('click', function () { shuffleEnabled = !shuffleEnabled; updateShuffleButtons(); });

    miniLike.addEventListener('click', function () { var s = currentPlaylist[currentIndex]; if (s) toggleFavorite(s.id); });
    fullLike.addEventListener('click', function () { var s = currentPlaylist[currentIndex]; if (s) toggleFavorite(s.id); });

    miniExpand.addEventListener('click', openFullPlayer);
    document.getElementById('miniInfoClick').addEventListener('click', openFullPlayer);
    fullClose.addEventListener('click', closeFullPlayer);
    fullBackdrop.addEventListener('click', closeFullPlayer);

    miniDisplay.addEventListener('click', enterDisplayMode);
    fullDisplay.addEventListener('click', enterDisplayMode);
    displayExit.addEventListener('click', function (e) { e.stopPropagation(); exitDisplayMode(); });

    var lastDisplayTouch = 0;
    function toggleDisplayControls(e) {
        if (!isDisplayMode) return;
        if (e && (e.target.closest('.display-controls') || e.target.closest('.display-btn'))) return;
        if (displayMode.classList.contains('controls-visible')) hideDisplayControls();
        else showDisplayControls();
    }
    displayMode.addEventListener('touchend', function (e) {
        if (!isDisplayMode) return;
        if (e.target.closest('.display-controls') || e.target.closest('.display-btn')) return;
        e.preventDefault();
        lastDisplayTouch = Date.now();
        toggleDisplayControls(e);
    }, { passive: false });
    displayMode.addEventListener('click', function (e) {
        if (Date.now() - lastDisplayTouch < 600) return;
        toggleDisplayControls(e);
    });
    displayMode.addEventListener('mousemove', function () {
        if (isDisplayMode) showDisplayControls();
    });

    volumeSlider.addEventListener('input', function (e) { setVolume(parseFloat(e.target.value)); });
    fullVolumeSlider.addEventListener('input', function (e) { setVolume(parseFloat(e.target.value)); });

    setupSeek(miniProgressBar, miniProgressFill);
    setupSeek(fullProgressBar, fullProgressFill);

    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
        else if (e.code === 'ArrowRight') { e.preventDefault(); playNext(); }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); playPrev(); }
        else if (e.code === 'KeyL') { loopEnabled = !loopEnabled; updateLoopButtons(); }
        else if (e.code === 'KeyS') { shuffleEnabled = !shuffleEnabled; updateShuffleButtons(); }
        else if (e.code === 'Escape') {
            if (isDisplayMode) exitDisplayMode();
            else closeFullPlayer();
        }
        else if (e.code === 'KeyF' && currentPlaylist.length) {
            if (isDisplayMode) exitDisplayMode();
            else enterDisplayMode();
        }
    });

    initTheme();
    setVolume(volume);
    loadSongs();

})();
