document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/index.json');
        const indexData = await response.json();

        const posts = Object.values(indexData)
            .filter(post =>
                post.url.includes('posts/') ||
                post.url.includes('photos/') ||
                post.url.includes('notes/')
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 3);

        const container = document.getElementById('recent-posts-container');

        posts.forEach(post => {
            const isPhoto = post.tags && post.tags.includes("photos");
            const el = document.createElement('div');
            el.className = isPhoto ? 'post-card photo-card' : 'post-card text-card';

            if (isPhoto) {
                el.innerHTML = `
                    <a href="${post.url}">
                        <img src="${post.previewimage || '/static/images/default-photo.png'}" alt="${post.title}" />
                        <div class="photo-caption">${post.description || post.title}</div>
                    </a>
                `;
            } else {
                const tagsHtml = post.tags ? post.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
                el.innerHTML = `
                    <a href="${post.url}" style="text-decoration: none;">
                        <h4>${post.title}</h4>
                        <div class="tags-row">${tagsHtml}</div>
                        <p class="post-snippet">${post.description || ''}</p>
                    </a>
                `;
            }
            container.appendChild(el);
        });
    } catch (err) {
        console.error("Failed to load Anna index.json", err);
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

        document.getElementById('lastfm-status').style.display = 'none';

        const embedContainer = document.getElementById('spotify-embed');
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
            transition: transform 0.2s ease;
        `;

        customPlayer.innerHTML = `
            <img src="${albumArt}" alt="Album Art" style="width: 64px; height: 64px; border-radius: 8px; margin-right: 12px; object-fit: cover;">
            <div style="display: flex; flex-direction: column; overflow: hidden;">
                <span style="font-size: 0.8rem; font-weight: bold; color: var(--color-primary); margin-bottom: 4px; text-transform: uppercase;">
                    ${track['@attr'] && track['@attr'].nowplaying ? '▶ Now Playing' : 'Recently Played'}
                </span>
                <strong style="font-size: 1rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${trackName}</strong>
                <span style="font-size: 0.9rem; color: var(--color-text-dim); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${artistName}</span>
            </div>
        `;

        embedContainer.replaceWith(customPlayer);

    } catch (err) {
        document.getElementById('lastfm-status').innerText = "Last.fm disconnected.";
        document.getElementById('spotify-embed').style.display = 'none';
    }
});
