import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lataa .env tiedosto
config({ path: path.join(__dirname, "../.env") });

// Apufunktiot
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncateText(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function formatDate(isoString) {
  if (!isoString) return "Ei päivämäärää";
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("fi-FI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch (e) {
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
    OTHER: "Muu"
  };
  return map[category] || category;
}

// 1. Hae data Firebasesta
async function fetchData() {
  console.log("📥 Fetching data from Firebase...");

  try {
    // Alusta Firebase
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(serviceAccount) });
    const db = getFirestore();

    // Hae hyväksytyt ja ratkaistut itemit
    const snapshot = await db.collection("lostItems")
      .where("status", "in", ["APPROVED", "RESOLVED"])
      .orderBy("timestamp", "desc")
      .limit(100) // Rajoita määrää aluksi
      .get();

    const items = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Muunna kuvan URL oikeaan muotoon
      let imageUrl = null;
      if (data.imageUrl1) {
        // Jos URL on jo täydellinen
        if (data.imageUrl1.includes("http")) {
          imageUrl = data.imageUrl1;
        } else {
          // Muodosta Supabase URL
          const fileName = data.imageUrl1.replace("lost-items/", "");
          imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/lost-items/${fileName}`;
        }
      }

      items.push({
        id: doc.id,
        title: data.title || "Ei nimeä",
        description: data.description || "",
        area: data.area || "Tuntematon",
        category: data.category || "OTHER",
        status: data.status || "APPROVED",
        timestamp: data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        imageUrl: imageUrl
      });
    });

    console.log(`✅ Found ${items.length} items`);
    return items;
  } catch (error) {
    console.error("❌ Error fetching from Firebase:", error.message);
    return []; // Palauta tyhjä array virheen sattuessa
  }
}

// 2. Generoi HTML
function generateHtml(items) {
  const date = new Date();
  const formattedDate = date.toLocaleDateString("fi-FI", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const approvedCount = items.filter(i => i.status === "APPROVED").length;
  const resolvedCount = items.filter(i => i.status === "RESOLVED").length;
  const uniqueAreas = new Set(items.map(i => i.area).filter(Boolean)).size;

  // Luo HTML-sisältö
  let itemsHtml = "";
  if (items.length === 0) {
    itemsHtml = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #6b7280;">
        <p style="font-size: 1.2rem;">Ei löytyneitä tavaroita tällä hetkellä.</p>
        <p>Tarkista myöhemmin uudelleen!</p>
      </div>
    `;
  } else {
    itemsHtml = items.map(item => `
      <article class="item-card" data-id="${item.id}" data-category="${item.category}">
        <div class="item-image-container">
          ${item.imageUrl ? `
            <img src="${item.imageUrl}" 
                 alt="${escapeHtml(item.title)}" 
                 class="item-image"
                 loading="lazy"
                 onerror="this.parentElement.innerHTML='<div class=\"item-image-placeholder\"><span>Kuva ei saatavilla</span></div>'">
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
          <h3 class="item-title">
            ${escapeHtml(item.title)}
          </h3>
          
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
          
          <p class="item-description">
            ${truncateText(escapeHtml(item.description), 120)}
          </p>
          
          <div class="item-actions">
            <span class="item-id">#${item.id}</span>
          </div>
        </div>
      </article>
    `).join("");
  }

  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Löytyneet tavarat - ${date.toLocaleDateString("fi-FI")}</title>
  <meta name="description" content="Automaattisesti päivittyvä lista löydetyistä tavaroista. ${items.length} ilmoitusta saatavilla.">
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
    
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    
    .subtitle {
      font-size: 1.1rem;
      opacity: 0.9;
      margin-bottom: 1rem;
    }
    
    .build-info {
      font-size: 0.9rem;
      opacity: 0.8;
      background: rgba(255,255,255,0.1);
      padding: 8px 12px;
      border-radius: 6px;
      display: inline-block;
    }
    
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
    
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      display: block;
      color: #667eea;
    }
    
    .stat-label {
      font-size: 0.9rem;
      color: #666;
    }
    
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
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .item-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 16px rgba(0,0,0,0.12);
    }
    
    .item-image-container {
      position: relative;
      height: 200px;
      background: #f0f0f0;
    }
    
    .item-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .item-image-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #999;
      font-size: 0.9rem;
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
    
    .status-approved {
      background: #10b981;
      color: white;
    }
    
    .status-resolved {
      background: #3b82f6;
      color: white;
    }
    
    .item-content {
      padding: 1.5rem;
    }
    
    .item-title {
      font-size: 1.25rem;
      margin-bottom: 0.75rem;
      color: #1f2937;
    }
    
    .item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: #6b7280;
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .icon {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    
    .item-description {
      color: #4b5563;
      margin-bottom: 1rem;
      font-size: 0.95rem;
      line-height: 1.5;
    }
    
    .item-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #e5e7eb;
    }
    
    .btn-details {
      background: #667eea;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
      transition: background 0.2s;
    }
    
    .btn-details:hover {
      background: #5a67d8;
    }
    
    .item-id {
      font-size: 0.8rem;
      color: #9ca3af;
      font-family: monospace;
    }
    
    footer {
      text-align: center;
      padding: 2rem 0;
      color: #6b7280;
      font-size: 0.9rem;
      border-top: 1px solid #e5e7eb;
      margin-top: 3rem;
    }
    
    footer a {
      color: #667eea;
      text-decoration: none;
    }
    
    footer a:hover {
      text-decoration: underline;
    }
    
    /* Responsiivisuus */
    @media (max-width: 768px) {
      body { padding: 15px; }
      h1 { font-size: 2rem; }
      .items-grid { grid-template-columns: 1fr; }
      .stats-grid { grid-template-columns: 1fr; }
    }
    
    @media (max-width: 480px) {
      header { padding: 1.5rem; }
      .item-meta { flex-direction: column; gap: 0.5rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1>📦 Löytyneet tavarat</h1>
    <p class="subtitle">Automaattisesti päivittyvä lista löydetyistä tavaroista</p>
    <span class="build-info">Viimeisin päivitys: ${formattedDate}</span>
  </header>

  <main>
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
    </div>

    <div class="items-grid" id="itemsContainer">
      ${itemsHtml}
    </div>
  </main>

  <footer>
    <p>
      Tämä sivu on staattinen snapshot <a href="https://lostrefound.blogspot.com">Lost&Found</a>-sovelluksesta.
      Data päivittyy automaattisesti tunnin välein.
    </p>
    <p>
      <a href="/data.json" target="_blank">JSON-data</a> |
      <a href="https://github.com/${process.env.GITHUB_USERNAME || "yourusername"}/lostfound-snapshot" target="_blank">Lähdekoodi</a> |
      Build ID: ${process.env.BUILD_TIMESTAMP || "local"}
    </p>
  </footer>

  <!-- SVG icons -->
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
</body>
</html>`;
}

// 3. Pääfunktio
async function main() {
  console.log("🚀 Starting snapshot build...");
  
  try {
    // Hae data
    const items = await fetchData();
    
    // Generoi HTML
    const html = generateHtml(items);
    
    // Varmista dist-kansio
    const distDir = path.join(__dirname, "../dist");
    if (!existsSync(distDir)) {
      await mkdir(distDir, { recursive: true });
    }
    
    // Tallenna HTML
    const outputPath = path.join(distDir, "index.html");
    await writeFile(outputPath, html, "utf-8");
    
    // Tallenna JSON-data
    const jsonData = {
      timestamp: new Date().toISOString(),
      buildId: process.env.BUILD_TIMESTAMP || "local",
      items: items.map(item => ({
        id: item.id,
        title: item.title,
        area: item.area,
        category: item.category,
        status: item.status,
        description: item.description,
        imageUrl: item.imageUrl,
        timestamp: item.timestamp
      }))
    };
    
    await writeFile(
      path.join(distDir, "data.json"),
      JSON.stringify(jsonData, null, 2),
      "utf-8"
    );
    
    console.log(`✅ Build completed!`);
    console.log(`📁 Output: ${outputPath}`);
    console.log(`📊 Items: ${items.length}`);
    console.log(`⚡ Build ID: ${process.env.BUILD_TIMESTAMP || "local"}`);
    
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }
}

// Suorita
main();
