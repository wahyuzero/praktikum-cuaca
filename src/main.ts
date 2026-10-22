import "./style.css";

// ===== Tipe data =====

interface HourlyData {
  time: string[];
  temperature_2m: (number | null)[];
}

interface WeatherResponse {
  timezone?: string;
  timezone_abbreviation?: string;
  hourly: HourlyData;
}

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

interface GeoResponse {
  results?: GeoResult[];
}

interface Row {
  t: string; // "YYYY-MM-DDTHH:MM"
  v: number; // suhu (C)
}

type TimeFilter = "all" | "0" | "1" | "2" | "3";
type TempFilter = "all" | "hot" | "cool";

interface FilterState {
  day: string;   // "all" | "YYYY-MM-DD"
  time: TimeFilter;
  temp: TempFilter;
}

interface City {
  name: string;
  lat: number;
  lon: number;
}

// ===== Konstanta =====

const API_BASE = "https://api.open-meteo.com/v1/forecast";
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MIN_QUERY = 3;

// ===== Elemen DOM =====

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Elemen #${id} tidak ditemukan`);
  return el as T;
}

const elStatus = byId("status");
const elFilters = byId<HTMLDivElement>("filters");
const elFres = byId<HTMLSpanElement>("fres");
const elStats = byId<HTMLElement>("stats");
const elTbody = byId<HTMLTableSectionElement>("tbody");
const elChart = byId<HTMLDivElement>("chart");
const elYaxis = byId<HTMLDivElement>("yaxis");
const elXaxis = byId<HTMLDivElement>("xaxis");
const elCount = byId<HTMLSpanElement>("count");
const elQ = byId<HTMLInputElement>("city-q");
const elRes = byId<HTMLDivElement>("city-res");

// ===== State global =====

let allRows: Row[] = [];
let globalAvg = 0;
let nowKey = ""; // "YYYY-MM-DDTHH" (format sama dgn data API)
let state: FilterState = { day: "all", time: "all", temp: "all" };
let curCity: City = { name: "Jakarta", lat: -6.2, lon: 106.8 }; // default sesuai tugas
let tzName = "Asia/Jakarta";
let tzAbbr = "WIB";

// ===== Util =====

function apiUrl(): string {
  return (
    `${API_BASE}?latitude=${curCity.lat}&longitude=${curCity.lon}` +
    `&hourly=temperature_2m&timezone=auto`
  );
}

function setCityUI(): void {
  byId("city-name").textContent = curCity.name;
  byId("sub-coords").innerHTML =
    `<i class="bi bi-geo-alt-fill"></i> ${curCity.lat.toFixed(2)}, ${curCity.lon.toFixed(2)}`;
  byId("foot-note").innerHTML =
    `Lokasi saat ini: <b>${curCity.name}</b> (${curCity.lat.toFixed(2)}, ${curCity.lon.toFixed(2)}), ` +
    `zona waktu ${tzName} (${tzAbbr})` +
    (curCity.name === "Jakarta" ? " — sesuai tugas." : ".");
}

function setStatus(mode: string, icon: string, text: string): void {
  elStatus.className = mode;
  elStatus.innerHTML =
    `<i class="bi ${icon}"></i><span id="status-text">${text}</span>` +
    `<button id="retry" type="button"><i class="bi bi-arrow-clockwise"></i> MUAT ULANG</button>`;
  byId<HTMLButtonElement>("retry").addEventListener("click", load);
}

function fmtTemp(t: number | null | undefined): string {
  return t === null || t === undefined ? "--" : t.toFixed(1);
}

function hourOf(r: Row): number {
  return parseInt(r.t.slice(11, 13), 10);
}

// ===== Filter =====

function filteredRows(): Row[] {
  return allRows.filter((r) => {
    if (state.day !== "all" && r.t.slice(0, 10) !== state.day) return false;
    const h = hourOf(r);
    if (state.time === "0" && !(h >= 0 && h <= 5)) return false;
    if (state.time === "1" && !(h >= 6 && h <= 11)) return false;
    if (state.time === "2" && !(h >= 12 && h <= 17)) return false;
    if (state.time === "3" && !(h >= 18 && h <= 23)) return false;
    if (state.temp === "hot" && !(r.v > globalAvg)) return false;
    if (state.temp === "cool" && !(r.v < globalAvg)) return false;
    return true;
  });
}

function buildDayChips(): void {
  const box = byId<HTMLDivElement>("fg-hari");
  box.querySelectorAll<HTMLButtonElement>(".chip").forEach((c) => c.remove());

  const mk = (day: string, label: string): void => {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "chip" + (state.day === day ? " on" : "");
    c.setAttribute("data-day", day);
    c.textContent = label;
    box.appendChild(c);
  };

  mk("all", "Semua");
  const seen = new Set<string>();
  allRows.forEach((r) => {
    const day = r.t.slice(0, 10);
    if (seen.has(day)) return;
    seen.add(day);
    const d = new Date(day + "T00:00:00");
    mk(day, `${HARI_PENDEK[d.getDay()]} ${day.slice(8, 10)}`);
  });
}

function onFilterClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  const btn = target.closest ? target.closest<HTMLButtonElement>(".chip") : null;
  if (!btn) return;
  if (btn.hasAttribute("data-day")) state.day = btn.getAttribute("data-day")!;
  if (btn.hasAttribute("data-time")) state.time = btn.getAttribute("data-time") as TimeFilter;
  if (btn.hasAttribute("data-temp")) state.temp = btn.getAttribute("data-temp") as TempFilter;

  const grp = btn.parentNode as HTMLElement;
  grp.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
  btn.classList.add("on");
  applyFilter();
}

// ===== Render =====

function renderStats(rows: Row[]): void {
  const nowRow = rows.find((r) => r.t.slice(0, 13) === nowKey) || null;

  if (rows.length) {
    const vals = rows.map((r) => r.v);
    byId("v-min").innerHTML = fmtTemp(Math.min(...vals)) + "<small>&deg;C</small>";
    byId("v-max").innerHTML = fmtTemp(Math.max(...vals)) + "<small>&deg;C</small>";
    byId("v-avg").innerHTML =
      fmtTemp(vals.reduce((a, b) => a + b, 0) / vals.length) + "<small>&deg;C</small>";
  } else {
    (["v-min", "v-max", "v-avg"] as const).forEach((id) => {
      byId(id).innerHTML = "--<small>&deg;C</small>";
    });
  }
  // "Sekarang" hanya terisi bila jam saat ini lolos filter
  byId("v-now").innerHTML =
    (nowRow ? fmtTemp(nowRow.v) : "--") + "<small>&deg;C</small>";
  elStats.hidden = false;
}

function renderChart(rows: Row[]): void {
  elChart.innerHTML = "";
  elXaxis.innerHTML = "";
  elYaxis.innerHTML = "";

  if (!rows.length) {
    elChart.innerHTML = '<div class="empty">TIDAK ADA DATA UNTUK FILTER INI</div>';
    return;
  }

  const vals = rows.map((r) => r.v);
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);

  elYaxis.innerHTML =
    `<span>${fmtTemp(vMax)} <span class="unit">C</span></span>` +
    `<span>${fmtTemp((vMax + vMin) / 2)}</span>` +
    `<span>${fmtTemp(vMin)}</span>`;

  const span = vMax - vMin || 1;
  let lastDayBar = "";
  rows.forEach((r, i) => {
    const bar = document.createElement("div");
    let cls = "bar";
    const day = r.t.slice(0, 10);
    if (i > 0 && day !== lastDayBar) cls += " day-start";
    lastDayBar = day;
    if (r.t.slice(0, 13) === nowKey) cls += " now";
    bar.className = cls;
    const h = 8 + ((r.v - vMin) / span) * 84; // 8%..92%
    bar.style.height = `${h}%`;
    bar.title = `${r.t.replace("T", " ")}${tzAbbr ? " " + tzAbbr : ""}  |  ${fmtTemp(r.v)} C`;
    elChart.appendChild(bar);
  });

  const labels: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r) => {
    const day = r.t.slice(0, 10);
    if (!seen.has(day)) {
      seen.add(day);
      const d = new Date(day + "T00:00:00");
      labels.push(`${HARI_PENDEK[d.getDay()]} ${day.slice(8, 10)}`);
    }
  });
  elXaxis.innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
}

function renderTable(rows: Row[]): void {
  let html = "";
  let lastDay = "";
  rows.forEach((r) => {
    const day = r.t.slice(0, 10);
    if (day !== lastDay) {
      lastDay = day;
      const d = new Date(day + "T00:00:00");
      html +=
        `<tr class="day-row"><td colspan="2"><i class="bi bi-calendar-week-fill"></i>` +
        `${HARI[d.getDay()]}, ${day}</td></tr>`;
    }
    const cls = r.t.slice(0, 13) === nowKey ? ' class="now"' : "";
    html +=
      `<tr${cls}><td>${r.t.replace("T", " ")}${tzAbbr ? " " + tzAbbr : ""}</td>` +
      `<td class="temp">${fmtTemp(r.v)} <span class="unit">&deg;C</span></td></tr>`;
  });
  if (!rows.length) {
    html = '<tr class="empty-row"><td colspan="2">TIDAK ADA DATA UNTUK FILTER INI</td></tr>';
  }
  elTbody.innerHTML = html;
  elCount.textContent = `${rows.length} baris`;
}

function applyFilter(): void {
  const rows = filteredRows();
  renderStats(rows);
  renderChart(rows);
  renderTable(rows);
  elFres.textContent = `${rows.length} / ${allRows.length} jam`;
}

// ===== Load data =====

function render(data: WeatherResponse): void {
  // zona waktu sesuai lokasi (dari respons API)
  tzName = data.timezone || "Asia/Jakarta";
  tzAbbr = (data.timezone_abbreviation || "").toUpperCase();
  // singkatan ramah utk zona Indonesia
  if (tzName === "Asia/Jakarta") tzAbbr = "WIB";
  if (tzName === "Asia/Makassar") tzAbbr = "WITA";
  if (tzName === "Asia/Jayapura") tzAbbr = "WIT";

  // buang jam yang belum ada datanya (null)
  allRows = [];
  for (let i = 0; i < data.hourly.time.length; i++) {
    const v = data.hourly.temperature_2m[i];
    if (v !== null && v !== undefined) allRows.push({ t: data.hourly.time[i], v });
  }
  const vals = allRows.map((r) => r.v);
  globalAvg = vals.reduce((a, b) => a + b, 0) / vals.length;

  // jam saat ini di zona waktu kota terpilih;
  // format disamakan dgn data API ("YYYY-MM-DDTHH") supaya bisa dibandingkan
  nowKey = new Date()
    .toLocaleString("sv-SE", { timeZone: tzName })
    .slice(0, 13)
    .replace(" ", "T");

  setCityUI();

  // reset filter ke default setiap muat ulang data
  state = { day: "all", time: "all", temp: "all" };
  document.querySelectorAll("#filters .chip.on").forEach((c) => c.classList.remove("on"));
  document
    .querySelectorAll(
      '#filters .chip[data-day="all"], #filters .chip[data-time="all"], #filters .chip[data-temp="all"]'
    )
    .forEach((c) => c.classList.add("on"));

  buildDayChips();
  elFilters.hidden = false;
  applyFilter();

  setStatus(
    "ok",
    "bi-check-circle-fill",
    `${curCity.name}: ${allRows.length} jam termuat ` +
      `(${allRows[0].t.slice(0, 10)} s/d ${allRows[allRows.length - 1].t.slice(0, 10)})`
  );
}

function load(): void {
  setStatus("", "bi-arrow-repeat", "Mengambil data dari API...");
  fetch(apiUrl())
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<WeatherResponse>;
    })
    .then(render)
    .catch((err: Error) => {
      setStatus("err", "bi-exclamation-triangle-fill", `GAGAL: ${err.message} — periksa koneksi lalu muat ulang.`);
    });
}

// ===== Pencarian kota (geocoding, min. 3 karakter) =====

let geoResults: GeoResult[] = [];
let debounceT: ReturnType<typeof setTimeout> | null = null;

function showRes(html: string): void {
  elRes.style.display = "block";
  elRes.innerHTML = html;
}

function hideRes(): void {
  elRes.style.display = "none";
}

function searchCity(): void {
  const q = elQ.value.trim();
  if (q.length < MIN_QUERY) {
    showRes('<div class="msg">KETIK MINIMAL 3 KARAKTER UNTUK MENCARI</div>');
    return;
  }
  showRes(`<div class="msg">MENCARI "${q.toUpperCase()}"...</div>`);
  fetch(`${GEO_URL}?name=${encodeURIComponent(q)}&count=8&language=id&format=json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<GeoResponse>;
    })
    .then((d) => {
      geoResults = d.results || [];
      if (!geoResults.length) {
        showRes(`<div class="msg">TIDAK ADA HASIL UNTUK "${q.toUpperCase()}"</div>`);
        return;
      }
      let html = "";
      geoResults.forEach((g, i) => {
        const det = [g.admin1, g.country].filter(Boolean).join(", ");
        html +=
          `<button type="button" class="res" data-i="${i}">${g.name}` +
          (det
            ? `<small>${det} / ${g.latitude.toFixed(2)}, ${g.longitude.toFixed(2)}</small>`
            : "") +
          `</button>`;
      });
      showRes(html);
    })
    .catch((err: Error) => {
      showRes(`<div class="msg">GAGAL MENCARI: ${err.message}</div>`);
    });
}

elQ.addEventListener("input", () => {
  if (debounceT) clearTimeout(debounceT);
  if (!elQ.value.trim()) {
    hideRes();
    return;
  }
  debounceT = setTimeout(searchCity, 450);
});

elQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (debounceT) clearTimeout(debounceT);
    searchCity();
  }
});

elRes.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest ? target.closest<HTMLButtonElement>(".res") : null;
  if (!btn) return;
  const g = geoResults[parseInt(btn.getAttribute("data-i")!, 10)];
  if (!g) return;
  curCity = { name: g.name, lat: g.latitude, lon: g.longitude };
  hideRes();
  elQ.value = "";
  load();
});

document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest && !target.closest("#fg-kota")) hideRes();
});

byId<HTMLButtonElement>("retry").addEventListener("click", load);
elFilters.addEventListener("click", onFilterClick);
load();
