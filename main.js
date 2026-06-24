const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://backend-products-ig13.onrender.com"; // your actual Render URL
// ── STATE ─────────────────────────────────────────────────────
let cursorStack = [null];
let currentPage = 0;
let category = "";
let page1Ids = []; // store page 1 IDs to check duplicates on page 2

// ── LOAD PRODUCTS (LEFT PANEL) ────────────────────────────────
async function loadProducts() {
  const cursor = cursorStack[currentPage];
  let url = `${API_BASE}/api/products?limit=20`;
  if (cursor) url += `&cursor=${cursor}`;
  if (category) url += `&category=${encodeURIComponent(category)}`;

  setStatus("loading", "Fetching products...");

  try {
    const res = await fetch(url);
    const { data, nextCursor, hasMore } = await res.json();

    // ── TEST 8: duplicate detection ──────────────────────────
    // On page 2+, check if any _id matches what we saw on page 1
    let duplicatesFound = [];
    if (currentPage === 1 && page1Ids.length > 0) {
      const currentIds = data.map((p) => p._id);
      duplicatesFound = currentIds.filter((id) => page1Ids.includes(id));
    }

    // Save page 1 IDs for duplicate check later
    if (currentPage === 0) {
      page1Ids = data.map((p) => p._id);
    }

    // ── RENDER CARDS ─────────────────────────────────────────
    const grid = document.getElementById("productGrid");
    grid.innerHTML = data
      .map((p) => {
        const isDup = duplicatesFound.includes(p._id);
        return `
        <div class="card ${isDup ? "card-duplicate" : ""}">
          ${isDup ? '<div class="dup-badge">DUPLICATE DETECTED</div>' : ""}
          <h3>${p.name}</h3>
          <div class="cat">${p.category}</div>
          <div class="price">₹${Number(p.price).toLocaleString()}</div>
          <div class="date">${new Date(p.createdAt).toLocaleString()}</div>
          <div class="id-tag">id: ${p._id.slice(-6)}</div>
        </div>`;
      })
      .join("");

    // ── UPDATE BUTTONS ────────────────────────────────────────
    document.getElementById("prevBtn").disabled = currentPage === 0;
    document.getElementById("nextBtn").disabled = !hasMore;
    document.getElementById("pageInfo").textContent = `Page ${currentPage + 1}`;

    // ── TEST 9: detect last page ──────────────────────────────
    if (!hasMore) {
      setStatus(
        "success",
        `Last page reached — hasMore is false. Total pages browsed: ${currentPage + 1}`,
      );
    } else if (duplicatesFound.length > 0) {
      setStatus(
        "error",
        `DUPLICATE IDs found on page 2: ${duplicatesFound.length} duplicates. Cursor logic is broken!`,
      );
    } else if (currentPage === 1) {
      setStatus(
        "success",
        `Page 2 loaded. No duplicates found — cursor is working correctly.`,
      );
    } else {
      setStatus(
        "success",
        `${data.length} products loaded. Page ${currentPage + 1}`,
      );
    }

    // Save next cursor
    if (nextCursor) cursorStack[currentPage + 1] = nextCursor;
  } catch (err) {
    setStatus("error", "Failed to fetch: " + err.message);
  }
}

function goNext() {
  currentPage++;
  loadProducts();
}
function goBack() {
  currentPage--;
  loadProducts();
}

// ── CATEGORY FILTER ───────────────────────────────────────────
async function loadCategories() {
  const res = await fetch(`${API_BASE}/api/products/categories`);
  const cats = await res.json();
  const sel = document.getElementById("categoryFilter");
  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}

document.getElementById("categoryFilter").addEventListener("change", (e) => {
  category = e.target.value;
  cursorStack = [null];
  currentPage = 0;
  page1Ids = [];
  loadProducts();
});

// ── LIVE FEED (RIGHT PANEL) ───────────────────────────────────
// This auto-refreshes every 5 seconds — so after you inject
// new products the feed updates automatically
let feedKnownIds = new Set();

async function loadFeed() {
  try {
    const res = await fetch(`${API_BASE}/api/products/recent`);
    const items = await res.json();

    // Detect newly appeared items since last poll
    const newlyAppeared = items.filter((p) => !feedKnownIds.has(p._id));
    items.forEach((p) => feedKnownIds.add(p._id));

    document.getElementById("liveFeed").innerHTML = items
      .map((p) => {
        const isNew =
          newlyAppeared.some((n) => n._id === p._id) &&
          feedKnownIds.size > items.length;
        return `
        <div class="feed-item ${isNew ? "feed-new" : ""}">
          <h4>${p.name} ${isNew ? '<span class="new-tag">just added</span>' : ""}</h4>
          <p>${p.category} · ${timeAgo(p.createdAt)}</p>
        </div>`;
      })
      .join("");

    document.getElementById("totalCount").textContent = "200,000+";
  } catch (err) {
    document.getElementById("liveFeed").innerHTML =
      `<p style="color:red;font-size:12px;">Feed error: ${err.message}</p>`;
  }
}

// ── TEST 8: INJECT NEW PRODUCTS BUTTON ───────────────────────
// This button adds 3 new products directly via a test route
// so you can visually prove page 2 won't show them
async function injectNewProducts() {
  const btn = document.getElementById("injectBtn");
  btn.disabled = true;
  btn.textContent = "Adding...";

  try {
    const res = await fetch(`${API_BASE}/api/products/test/inject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Check if response is actually JSON before parsing
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error(
        `Server returned HTML instead of JSON. Status: ${res.status}. URL might be wrong.`,
      );
    }

    const data = await res.json();
    setStatus(
      "success",
      `3 new products added. Now click Next to prove they dont appear on page 2.`,
    );
    await loadFeed();
  } catch (err) {
    setStatus("error", "Inject failed: " + err.message);
  }

  btn.disabled = false;
  btn.textContent = "Inject 3 new products";
}

// ── HELPERS ───────────────────────────────────────────────────
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function setStatus(type, msg) {
  const el = document.getElementById("statusBar");
  el.className = `status-bar status-${type}`;
  el.textContent = msg;
}

// ── AUTO REFRESH FEED EVERY 5s ────────────────────────────────
setInterval(loadFeed, 5000);

// ── INIT ──────────────────────────────────────────────────────
loadCategories();
loadProducts();
loadFeed();
