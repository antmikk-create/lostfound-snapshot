import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "&#039;");
}

function truncateText(text, maxLength) {
  if (text === null || text === undefined) return "";
  const s = String(text);
  if (s.length <= maxLength) return s;
  return s.substring(0, maxLength) + "...";
}

function formatDate(isoString) {
  if (!isoString) return "Ei päivämäärää";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("fi-FI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "Virheellinen päivämäärä";
  }
}

function getCategoryName(category) {
  const map = {
    ELECTRONICS: "Elektroniikka",
    CLOTHING: "Vaatteet",
    DOCUMENTS: "Asiakirjat",
    KEYS: "Avaimet",
    WALLET: "Lompakko",
    JEWELRY: "Koru",
    BAG: "Laukku",
    OTHER: "Muu",
  };
  return map[category] || category;
}

async function fetchData() {
  console.log("📥 Fetching data from Firebase...");

  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore();

    const snapshot = await db
      .collection("lostItems")
      .where("status", "in", ["APPROVED", "RESOLVED"])
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();

    const items = [];
    const areasSet = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();

      let imageUrl = null;
      if (data.imageUrl1) {
        if (data.imageUrl1.includes("http")) {
          imageUrl = data.imageUrl1;
        } else {
          const fileName = data.imageUrl1.replace("lost-items/", "");
          imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/lost-items/${fileName}`;
        }
      }

      const area = data.area || "Tuntematon";
      areasSet.add(area);

      const category = data.category || "OTHER";
      const type = category === "LOST" ? "LOST" : "FOUND";

      items.push({
        id: doc.id,
        title: data.title || "Ei nimeä",
        description: data.description || "",
        area,
        category,
        type,
        status: data.status || "APPROVED",
        timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        imageUrl,
        facebookLink: data.facebookLink || null,
      });
    });

    const areas = Array.from(areasSet).sort();

    console.log(`✅ Found ${items.length} items`);
    console.log(`🗺️  Areas found: ${areas.length} (${areas.join(", ")})`);

    return { items, areas };
  } catch (error) {
    console.error("❌ Error fetching from Firebase:", error.message);
    return { items: [], areas: [] };
  }
}

function generateHtml({ items, areas }) {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("fi-FI", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const approvedCount = items.filter((i) => i.status === "APPROVED").length;
  const resolvedCount = items.filter((i) => i.status === "RESOLVED").length;
  const uniqueAreas = areas.length;
  const facebookCount = items.filter((i) => i.facebookLink).length;

  const areaOptions = areas
    .map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`)
    .join("");

  const itemTypeCounts = {
    FOUND: items.filter((i) => i.type === "FOUND").length,
    LOST: items.filter((i) => i.type === "LOST").length,
  const itemTypeCounts = {
    FOUND: items.filter((i) => i.type === "FOUND").length,
    LOST: items.filter((i) => i.type === "LOST").length,
  };

  const areaFilterHtml = `
    <div class="filter-row">
      <div class="filter-group">
        <label for="typeFilter" class="filter-label">
          <svg class="filter-icon" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          Ilmoitustyyppi:
        </label>
        <select id="typeFilter" class="area-filter">
          <option value="FOUND" selected>Löytyneet (${itemTypeCounts.FOUND})</option>
          <option value="LOST">Kadonneet (${itemTypeCounts.LOST})</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="areaFilter" class="filter-label">
          <svg class="filter-icon" viewBox="0 0 24 24">
      </div>

      <div class="filter-group">
        <label for="areaFilter" class="filter-label">
          <svg class="filter-icon" viewBox="0 0 24 24">
            <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
          </svg>
          Suodata alueen mukaan:
        </label>
        <select id="areaFilter" class="area-filter">
          <option value="">Kaikki alueet (${items.length} ilmoitusta)</option>
          ${areaOptions}
        </select>
      </div>

      <div class="area-stats">
        <span id="selectedAreaCount">${items.filter((i) => i.type === "FOUND").length}</span> ilmoitusta näytetään
      </div>
    </div>
  `;

  let itemsHtml = "";
  if (items.length === 0) {
    itemsHtml = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #6b7280;">
        <p style="font-size: 1.2rem;">Ei löytyneitä tavaroita tällä hetkellä.</p>
        <p>Tarkista myöhemmin uudelleen!</p>
      </div>
    `;
  } else {
    itemsHtml = items
      .map(
        (item) => `
        <article class="item-card" data-id="${item.id}" data-category="${item.category}" data-area="${escapeHtml(
          item.area,
        )}" data-type="${item.type}">
          <div class="item-image-container">
            ${item.imageUrl ? `
              <img src="${item.imageUrl}"
                   alt="${escapeHtml(item.title)}"
                   class="item-image"
                   loading="lazy"
                   onerror="this.parentElement.innerHTML='<div class="item-image-placeholder"><span>Kuva ei saatavilla</span></div>'">
            ` : `
              <div class="item-image-placeholder">
                <span>Ei kuvaa</span>
              </div>
            `}
            <div class="item-status status-${item.status.toLowerCase()}">
              ${item.status === "APPROVED" ? "Avoin" : "Ratkaistu"}
            </div>
          </div>

          <div class="item-content">
            <div class="item-header">
              <h3 class="item-title">${escapeHtml(item.title)}</h3>
              ${item.facebookLink ? `
                <a href="${escapeHtml(item.facebookLink)}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="facebook-icon-link"
                   title="Facebook-ilmoitus">
                  <svg class="facebook-icon" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              ` : ""}
            </div>

            <div class="item-meta">
              <span class="meta-item">
                <svg class="icon"><use href="#icon-location"></use></svg>
                ${escapeHtml(item.area)}
              </span>

              <span class="meta-item">
                <svg class="icon"><use href="#icon-category"></use></svg>
                ${getCategoryName(item.category)}
              </span>

              <span class="meta-item">
                <svg class="icon"><use href="#icon-date"></use></svg>
                ${formatDate(item.timestamp)}
              </span>
            </div>

            <p class="item-description">${truncateText(escapeHtml(item.description), 120)}</p>

            <div class="item-actions">
              <span class="item-id">#${item.id}</span>
              ${item.facebookLink ? `
                <a href="${escapeHtml(item.facebookLink)}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="btn-facebook">
                  <svg class="facebook-icon-small" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </a>
              ` : ""}
            </div>
          </div>
        </article>
      `,
      )
      .join("");
  }

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Löytyneet ja kadonneet tavarat - ${date.toLocaleDateString("fi-FI")}</title>
  <meta name="description" content="Vaihtuva lista kadonneista ja löydetyistä tavaroista. ${items.length} ilmoitusta saatavilla.">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f8f9fa;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }

    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }

    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }

    .subtitle { font-size: 1.1rem; opacity: 0.9; margin-bottom: 1rem; }

    .build-info {
      font-size: 0.9rem;
      opacity: 0.8;
      background: rgba(255,255,255,0.1);
      padding: 8px 12px;
      border-radius: 6px;
      display: inline-block;
    }

    .filter-row {
      background: white;
      padding: 1.5rem;
      border-radius: 10px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 1.2rem;
    }

    .filter-group { display: flex; flex-direction: column; gap: 0.5rem; }

    .filter-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #4b5563;
      white-space: nowrap;
    }

    .filter-icon { width: 20px; height: 20px; fill: #667eea; }

    .area-filter {
      min-width: 220px;
      padding: 10px 15px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 1rem;
      background: white;
      color: #333;
      transition: border-color 0.2s;
      cursor: pointer;
    }

    .area-filter:hover { border-color: #9ca3af; }

    .area-filter:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .area-stats {
      font-size: 0.95rem;
      color: #6b7280;
      padding: 5px 10px;
      background: #f3f4f6;
      border-radius: 6px;
      white-space: nowrap;
      margin-bottom: 2px;
    }

    #selectedAreaCount { font-weight: bold; color: #667eea; }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      text-align: center;
    }

    .stat-number { font-size: 2rem; font-weight: bold; display: block; color: #667eea; }
    .stat-label { font-size: 0.9rem; color: #666; }

    .items-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 3rem;
    }

    .item-card {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s, box-shadow 0.2s, opacity 0.3s;
    }

    .item-card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.12); }
    .item-card.hidden { display: none; }

    .item-image-container { position: relative; height: 200px; background: #f0f0f0; }
    .item-image { width: 100%; height: 100%; object-fit: cover; }

    .item-image-placeholder {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #64748b;
      font-size: 0.9rem;
      background-color: #f1f5f9;
      background-repeat: no-repeat;
      background-position: center;
      background-size: 70%;
    }

    .item-image-placeholder span {
      position: relative;
      z-index: 1;
      background: rgba(255,255,255,0.8);
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
    }

    .item-status {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-approved { background: #10b981; color: white; }
    .status-resolved { background: #3b82f6; color: white; }

    .item-content { padding: 1.5rem; }

    .item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
    .item-title { font-size: 1.25rem; color: #1f2937; margin: 0; flex: 1; }

    .facebook-icon-link {
      display: inline-flex;
      align-items: center;
      margin-left: 10px;
      color: #1877F2;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .facebook-icon-link:hover { opacity: 1; }

    .facebook-icon { width: 24px; height: 24px; fill: currentColor; }
    .facebook-icon-small { width: 16px; height: 16px; fill: currentColor; }

    .item-meta { display: flex; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem; color: #6b7280; }
    .meta-item { display: flex; align-items: center; gap: 4px; }
    .icon { width: 16px; height: 16px; fill: currentColor; }

    .item-description { color: #4b5563; margin-bottom: 1rem; font-size: 0.95rem; line-height: 1.5; }

    .item-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }

    .btn-facebook {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #1877F2;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      transition: background 0.2s;
    }

    .btn-facebook:hover { background: #166FE5; }

    .item-id { font-size: 0.8rem; color: #9ca3af; font-family: monospace; }

    footer {
      text-align: center;
      padding: 2rem 0;
      color: #6b7280;
      font-size: 0.9rem;
      border-top: 1px solid #e5e7eb;
      margin-top: 3rem;
    }

    footer a { color: #667eea; text-decoration: none; }
    footer a:hover { text-decoration: underline; }

    @media (max-width: 768px) {
      body { padding: 15px; }
      h1 { font-size: 2rem; }
      .items-grid { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: 1fr; }
      .filter-row { flex-direction: column; align-items: stretch; }
      .area-filter { min-width: auto; }
    }

    @media (max-width: 480px) {
      header { padding: 1.5rem; }
      .item-meta { flex-direction: column; gap: 0.5rem; }
      .item-header { flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <h1>📦 Kadonneet &amp; löytyneet tavarat</h1>
    <p class="subtitle">Valitse yläreunasta kumpia ilmoituksia näytetään – samalla sivulla.</p>
    <span class="build-info">Viimeisin päivitys: ${formattedDate}</span>
  </header>

  <main>
    ${areaFilterHtml}

    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-number">${items.length}</span>
        <span class="stat-label">Ilmoitusta yhteensä</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${approvedCount}</span>
        <span class="stat-label">Avoinna</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${resolvedCount}</span>
        <span class="stat-label">Ratkaistu</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${uniqueAreas}</span>
        <span class="stat-label">Eri aluetta</span>
      </div>
      <div class="stat-card">
        <span class="stat-number">${facebookCount}</span>
        <span class="stat-label">Facebook-ilmoitusta</span>
      </div>
    </div>

    <div class="items-grid" id="itemsContainer">
      ${itemsHtml}
    </div>
  </main>

  <footer>
    <p>
      Tämä sivu on staattinen snapshot <a href="https://lostrefound.blogspot.com">Lost&amp;Found</a>-sovelluksesta.
      Data päivittyy automaattisesti tunnin välein.
    </p>
    <p>
      <a href="/data.json" target="_blank">JSON-data</a> |
      <a href="https://github.com/${process.env.GITHUB_USERNAME || "yourusername"}/lostfound-snapshot" target="_blank">Lähdekoodi</a> |
      Build ID: ${process.env.BUILD_TIMESTAMP || "local"}
    </p>
  </footer>

  <svg style="display: none;">
    <defs>
      <symbol id="icon-location" viewBox="0 0 24 24">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </symbol>
      <symbol id="icon-category" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      </symbol>
      <symbol id="icon-date" viewBox="0 0 24 24">
        <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
      </symbol>
    </defs>
  </svg>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      const typeFilter = document.getElementById('typeFilter');
      const areaFilter = document.getElementById('areaFilter');
      const itemCards = document.querySelectorAll('.item-card');
      const selectedAreaCount = document.getElementById('selectedAreaCount');

      function applyFilters() {
        const selectedType = typeFilter.value;
        const selectedArea = areaFilter.value;

        let visibleCount = 0;
        itemCards.forEach(card => {
          const cardType = card.getAttribute('data-type');
          const cardArea = card.getAttribute('data-area');

          const matchesType = !selectedType || cardType === selectedType;
          const matchesArea = !selectedArea || cardArea === selectedArea;

          if (matchesType && matchesArea) {
            card.classList.remove('hidden');
            visibleCount++;
          } else {
            card.classList.add('hidden');
          }
        });

        selectedAreaCount.textContent = visibleCount;
      }

      typeFilter.addEventListener('change', applyFilters);
      areaFilter.addEventListener('change', applyFilters);

      applyFilters();
    });
  </script>
</body>
</html>`;
}

// 3. Pääfunktio
async function main() {
  console.log("🚀 Starting snapshot build...");

  try {
    const { items, areas } = await fetchData();

    const html = generateHtml({ items, areas });

    const distDir = path.join(__dirname, "../dist");
    if (!existsSync(distDir)) {
      await mkdir(distDir, { recursive: true });
    }

    const outputPath = path.join(distDir, "index.html");
    await writeFile(outputPath, html, "utf-8");

    const jsonData = {
      timestamp: new Date().toISOString(),
      buildId: process.env.BUILD_TIMESTAMP || "local",
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        area: item.area,
        category: item.category,
        type: item.type,
        status: item.status,
        description: item.description,
        imageUrl: item.imageUrl,
        facebookLink: item.facebookLink,
        timestamp: item.timestamp,
      })),
      areas,
    };

    await writeFile(
      path.join(distDir, "data.json"),
      JSON.stringify(jsonData, null, 2),
      "utf-8",
    );

    console.log("✅ Build completed!");
    console.log(`📁 Output: ${outputPath}`);
    console.log(`📊 Items: ${items.length}`);
    console.log(`🗺️ Areas: ${areas.length} (${areas.join(", ")})`);
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

main();

