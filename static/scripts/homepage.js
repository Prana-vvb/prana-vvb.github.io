document.addEventListener("DOMContentLoaded", async () => {

    const container = document.getElementById('recent-posts-container');
    if (container) {
        const posts = Array.from(container.querySelectorAll('.sortable-post'));

        posts.sort((a, b) => {
            const dateA = new Date(a.getAttribute('data-date') || 0);
            const dateB = new Date(b.getAttribute('data-date') || 0);
            return dateB - dateA;
        });

        container.innerHTML = '';

        posts.forEach(post => container.appendChild(post));

        container.style.opacity = '1';
    }

    const lastfmUser = 'prana-vvb';
    const lastfmKey = 'd1c5d79345509b26148ab0d2d20e6303';

    try {
        const lfmResponse = await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${lastfmUser}&api_key=${lastfmKey}&format=json&limit=1`);
        const lfmData = await lfmResponse.json();
        const track = lfmData.recenttracks.track[0];

        const trackName = track.name;
        const artistName = track.artist['#text'];
        const albumArt = track.image[3]['#text'] || '/static/images/default-album.png';
        const trackUrl = track.url;

        const statusEl = document.getElementById('lastfm-status');
        if (statusEl) statusEl.style.display = 'none';

        const embedContainer = document.getElementById('spotify-embed');
        if (!embedContainer) return;

        const customPlayer = document.createElement('a');
        customPlayer.href = trackUrl;
        customPlayer.target = "_blank";
        customPlayer.style.cssText = `
            display: flex;
            align-items: center;
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: 12px;
            padding: 12px;
            text-decoration: none;
            color: var(--color-text);
            margin-top: 1rem;
        `;

        customPlayer.innerHTML = `
            <img src="${albumArt}" alt="Album Art" style="width: 64px; height: 64px; border-radius: 8px; margin-right: 12px; object-fit: cover;">
            <div style="display: flex; flex-direction: column; overflow: hidden;">
                <span style="font-size: 0.8rem; font-weight: bold; color: var(--color-text-dim); margin-bottom: 4px; text-transform: uppercase;">
                    ${track['@attr'] && track['@attr'].nowplaying ? '▶ Now Playing' : 'Recently Played'}
                </span>
                <strong style="font-size: 1rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; color: var(--color-text);">${trackName}</strong>
                <span style="font-size: 0.9rem; color: var(--color-text-dim); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${artistName}</span>
            </div>
        `;

        embedContainer.replaceWith(customPlayer);

    } catch (err) {
        const statusEl = document.getElementById('lastfm-status');
        if (statusEl) statusEl.innerText = "Last.fm disconnected.";

        const embedContainer = document.getElementById('spotify-embed');
        if (embedContainer) embedContainer.style.display = 'none';
    }
});
