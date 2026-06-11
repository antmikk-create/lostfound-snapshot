// CLIENT-SIDE JS
// Wait for DOM to load

document.addEventListener('DOMContentLoaded', function() {
    console.log('📊 Loading data...');

    // Load data from JSON
    fetch('/data.json')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            console.log('✅ Data loaded:', data.items.length, 'items');
            window.allItems = data.items;
            initializeFilters(data.items);
            renderItems(data.items);
        })
        .catch(error => {
            console.error('❌ Error loading data:', error);
            document.getElementById('itemsContainer').innerHTML =
                '<div class="error-message">' +
                '   <p>❌ Virhe datan latauksessa</p>' +
                '   <p>Yritä myöhemmin uudelleen.</p>' +
                '</div>';
        });

    function initializeFilters(items) {
        // Get unique areas
        const areas = [...new Set(items.map(i => i.area).filter(Boolean))].sort();
        const areaSelect = document.getElementById('areaFilter');

        areas.forEach(area => {
            const option = document.createElement('option');
            option.value = area;
            option.textContent = area;
            areaSelect.appendChild(option);
        });

        // Get unique categories
        const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
        const categorySelect = document.getElementById('categoryFilter');

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = getCategoryDisplayName(category);
            categorySelect.appendChild(option);
        });

        // Type default + list (if present in HTML)
        const typeSelect = document.getElementById('typeFilter');
        if (typeSelect) {
            // If type options are not already present in HTML, populate them.
            const hasOptions = typeSelect.options && typeSelect.options.length > 0;
            if (!hasOptions) {
                const found = document.createElement('option');
                found.value = 'FOUND';
                found.textContent = 'Löytyneet';
                typeSelect.appendChild(found);

                const lost = document.createElement('option');
                lost.value = 'LOST';
                lost.textContent = 'Kadonneet';
                typeSelect.appendChild(lost);
            }
        }

        // Add event listeners
        const typeEl = document.getElementById('typeFilter');
        if (typeEl) typeEl.addEventListener('change', filterItems);

        areaSelect.addEventListener('change', filterItems);
        document.getElementById('categoryFilter').addEventListener('change', filterItems);
        document.getElementById('statusFilter').addEventListener('change', filterItems);
        document.getElementById('searchInput').addEventListener('input', filterItems);

        // Apply initial render with default type if present
        filterItems();
    }

    function filterItems() {
        const area = document.getElementById('areaFilter')?.value;
        const category = document.getElementById('categoryFilter')?.value;
        const status = document.getElementById('statusFilter')?.value;
        const search = document.getElementById('searchInput')?.value?.toLowerCase() || '';
        const type = document.getElementById('typeFilter')?.value;

        const filtered = window.allItems.filter(item => {
            // Type filter (FOUND/LOST)
            if (type && item.type !== type) return false;

            // Area filter
            if (area && item.area !== area) return false;

            // Category filter
            if (category && item.category !== category) return false;

            // Status filter
            if (status) {
                if (status === 'approved' && item.status !== 'APPROVED') return false;
                if (status === 'resolved' && item.status !== 'RESOLVED') return false;
            }

            // Search filter
            if (search) {
                const searchText = (item.title + ' ' + (item.description || '')).toLowerCase();
                if (!searchText.includes(search)) return false;
            }

            return true;
        });

        renderItems(filtered);
    }

    function renderItems(items) {
        const container = document.getElementById('itemsContainer');

        if (items.length === 0) {
            container.innerHTML =
                '<div class="no-items">' +
                '   <p>😔 Ei löytynyt ilmoituksia valituilla suodattimilla.</p>' +
                '   <p>Kokeile muuttaa hakuehtoja.</p>' +
                '</div>';
            return;
        }

        let html = '';

        items.forEach(item => {
            const statusClass = (item.status || '').toLowerCase();
            const statusText = item.status === 'APPROVED' ? 'Avoin' : 'Ratkaistu';

            html += `
                <article class="item-card" data-id="${item.id}" data-category="${item.category}">
                    <div class="item-image-container">
                        ${item.imageUrl ? `
                            <img src="${item.imageUrl}" 
                                 alt="${escapeHtml(item.title)}" 
                                 class="item-image"
                                 loading="lazy">
                        ` : `
                            <div class="no-image">
                                <span>Ei kuvaa</span>
                            </div>
                        `}
                        <div class="item-status ${statusClass}">
                            ${statusText}
                        </div>
                    </div>

                    <div class="item-content">
                        <h3 class="item-title">${escapeHtml(item.title)}</h3>

                        <div class="item-meta">
                            <span class="meta-item">
                                <svg class="icon"><use href="#icon-location"></use></svg>
                                ${escapeHtml(item.area || 'Ei määritelty')}
                            </span>

                            <span class="meta-item">
                                <svg class="icon"><use href="#icon-category"></use></svg>
                                ${getCategoryDisplayName(item.category)}
                            </span>

                            <span class="meta-item">
                                <svg class="icon"><use href="#icon-date"></use></svg>
                                ${formatDate(item.timestamp)}
                            </span>
                        </div>

                        <p class="item-description">
                            ${truncateText(escapeHtml(item.description || ''), 100)}
                        </p>

                        <div class="item-actions">
                            <span class="item-id">#${item.id}</span>
                        </div>
                    </div>
                </article>
            `;
        });

        container.innerHTML = html;
    }

    // Helper functions
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function formatDate(isoString) {
        if (!isoString) return 'Ei päivämäärää';
        const date = new Date(isoString);
        return date.toLocaleDateString('fi-FI');
    }

    function getCategoryDisplayName(category) {
        const map = {
            'ELECTRONICS': 'Elektroniikka',
            'CLOTHING': 'Vaatteet',
            'DOCUMENTS': 'Asiakirjat',
            'KEYS': 'Avaimet',
            'WALLET': 'Lompakko',
            'JEWELRY': 'Koru',
            'BAG': 'Laukku',
            'OTHER': 'Muu'
        };
        return map[category] || category;
    }
});

