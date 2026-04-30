const DATA_URL = "/api/data.csv";
const PAGE_SIZE = 10;
const ISSG_ID = "__issg__";
const WIB_TIMEZONE = "Asia/Jakarta";
const RANGE_OPTIONS = [
  { key: "10m", label: "10 Menit", seconds: 10 * 60 },
  { key: "1h", label: "1 Jam", seconds: 60 * 60 },
  { key: "6h", label: "6 Jam", seconds: 6 * 60 * 60 },
  { key: "12h", label: "12 Jam", seconds: 12 * 60 * 60 },
  { key: "24h", label: "24 Jam", seconds: 24 * 60 * 60 },
  { key: "7d", label: "7 Hari", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", label: "30 Hari", seconds: 30 * 24 * 60 * 60 },
];
const WEATHER_LABELS = {
  0: "Sangat Cerah",
  1: "Cerah",
  2: "Cerah Asap",
  3: "Cerah Smog",
  4: "Berawan",
  5: "Cerah Ringan",
  6: "Cerah Terik",
  7: "Awan Tebal",
  8: "Hujan",
  9: "Berkabut",
  10: "Cerah Panas",
  11: "Panas Terik",
  12: "Mendung",
  13: "Terang",
  14: "Hangat",
  15: "Redup",
  16: "Hujan Lebat",
  17: "Kering",
  18: "Gersang",
  19: "Badai Pasir",
  20: "Terendam",
  21: "Berkabut Ungu",
  22: "Mendung Tebal",
};
const WEATHER_NAME_TO_CODE = Object.entries(WEATHER_LABELS).reduce((accumulator, [code, label]) => {
  if (!(label.toLowerCase() in accumulator)) {
    accumulator[label.toLowerCase()] = Number(code);
  }
  return accumulator;
}, {});

const state = {
  rows: [],
  servers: [],
  filteredServers: [],
  leaderboardRows: [],
  filteredLeaderboardRows: [],
  availableLeaderboardMonths: [],
  monthlyLeaderboardByMonth: new Map(),
  leaderboardMode: "realtime",
  selectedLeaderboardMonth: "",
  snapshots: [],
  page: 1,
  selectedServerId: null,
  selectedRange: "24h",
  chartSearchQuery: "",
  compareSearchQueryA: "",
  compareSearchQueryB: "",
  compareServerAId: null,
  compareServerBId: null,
  lastSource: null,
  lastProjectCsvText: null,
  chart: null,
};

const elements = {
  refreshButton: document.getElementById("refreshButton"),
  filePicker: document.getElementById("filePicker"),
  statusMessage: document.getElementById("statusMessage"),
  dataSource: document.getElementById("dataSource"),
  snapshotTime: document.getElementById("snapshotTime"),
  rowCount: document.getElementById("rowCount"),
  totalPlayers: document.getElementById("totalPlayers"),
  playerDelta: document.getElementById("playerDelta"),
  activeServers: document.getElementById("activeServers"),
  serverDelta: document.getElementById("serverDelta"),
  trackedServers: document.getElementById("trackedServers"),
  issgValue: document.getElementById("issgValue"),
  issgDelta: document.getElementById("issgDelta"),
  chartTitle: document.getElementById("chartTitle"),
  chartContext: document.getElementById("chartContext"),
  timeframeControls: document.getElementById("timeframeControls"),
  serverSearchInput: document.getElementById("serverSearchInput"),
  serverSelect: document.getElementById("serverSelect"),
  serverIdentity: document.getElementById("serverIdentity"),
  serverGamemode: document.getElementById("serverGamemode"),
  serverMap: document.getElementById("serverMap"),
  serverTime: document.getElementById("serverTime"),
  serverWeather: document.getElementById("serverWeather"),
  trackingSince: document.getElementById("trackingSince"),
  loadingOverlay: document.getElementById("loadingOverlay"),
  insightPanelLabel: document.getElementById("insightPanelLabel"),
  insightHeadlines: document.getElementById("insightHeadlines"),
  insightSummary: document.getElementById("insightSummary"),
  insightCards: document.getElementById("insightCards"),
  leaderboardTitle: document.getElementById("leaderboardTitle"),
  leaderboardMode: document.getElementById("leaderboardMode"),
  leaderboardMonth: document.getElementById("leaderboardMonth"),
  leaderboardMeta: document.getElementById("leaderboardMeta"),
  playersHeader: document.getElementById("playersHeader"),
  capacityHeader: document.getElementById("capacityHeader"),
  deltaHeader: document.getElementById("deltaHeader"),
  tableBody: document.getElementById("serverTableBody"),
  searchInput: document.getElementById("searchInput"),
  prevPageButton: document.getElementById("prevPageButton"),
  nextPageButton: document.getElementById("nextPageButton"),
  pageIndicator: document.getElementById("pageIndicator"),
  compareNote: document.getElementById("compareNote"),
  compareSearchInputA: document.getElementById("compareSearchInputA"),
  compareSearchInputB: document.getElementById("compareSearchInputB"),
  compareSelectA: document.getElementById("compareSelectA"),
  compareSelectB: document.getElementById("compareSelectB"),
  compareStats: document.getElementById("compareStats"),
};

function setStatus(message, tone = "neutral") {
  if (!elements.statusMessage) {
    return;
  }
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = tone;
}

function setLoading(isLoading, message) {
  document.documentElement.classList.toggle("is-loading", Boolean(isLoading));
  if (elements.loadingOverlay && message) {
    const strong = elements.loadingOverlay.querySelector("strong");
    if (strong) {
      strong.textContent = message;
    }
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDelta(value) {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  if (value < 0) {
    return `${formatNumber(value)}`;
  }
  return "0";
}

function getDeltaClass(value) {
  if (value > 0) {
    return "delta up";
  }
  if (value < 0) {
    return "delta down";
  }
  return "delta neutral";
}

function getDateParts(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const lookup = {};
  parts.forEach((part) => {
    lookup[part.type] = part.value;
  });

  return {
    weekday: lookup.weekday || "",
    day: lookup.day || "",
    month: lookup.month || "",
    year: lookup.year || "",
    hour: lookup.hour || "",
    minute: lookup.minute || "",
  };
}

function formatSnapshotTimestamp(unixSeconds) {
  if (!unixSeconds) {
    return "-";
  }

  const parts = getDateParts(unixSeconds);
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}.${parts.minute} WIB`;
}

function formatAxisTimestamp(unixSeconds, rangeKey) {
  const parts = getDateParts(unixSeconds);

  if (rangeKey === "1h" || rangeKey === "6h" || rangeKey === "12h") {
    return `${parts.hour}.${parts.minute}`;
  }

  if (rangeKey === "24h") {
    return `${parts.weekday} ${parts.hour}.${parts.minute}`;
  }

  if (rangeKey === "7d") {
    return `${parts.weekday}, ${parts.day} ${parts.month}`;
  }

  if (rangeKey === "30d") {
    return `${parts.day} ${parts.month}`;
  }

  return `${parts.day} ${parts.month} ${parts.year}`;
}

function toMonthKey(unixSeconds) {
  const date = new Date(unixSeconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) {
    return "Tracked Monthly";
  }
  const [yearText, monthText] = String(monthKey).split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return monthKey;
  }
  return new Intl.DateTimeFormat("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: WIB_TIMEZONE,
  }).format(new Date(year, monthIndex, 1));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPercent(value) {
  return `${value.toFixed(2)}%`;
}

function formatRatio(value) {
  return value.toFixed(2);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  if (!totalSeconds) {
    return "0m";
  }

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

function formatSignedPercent(value) {
  if (!Number.isFinite(value)) {
    return "0.00%";
  }
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function getTrackedAvgClass(server, pageRows) {
  const avgPlayers = Number(server?.avgPlayers || 0);
  if (!Number.isFinite(avgPlayers)) {
    return "neutral";
  }
  const avgValues = (pageRows || [])
    .map((item) => Number(item?.avgPlayers))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  if (!avgValues.length) {
    return "neutral";
  }
  const median = computeMedian(avgValues);
  if (avgPlayers > median) {
    return "up";
  }
  if (avgPlayers < median) {
    return "down";
  }
  return "tie";
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const lines = trimmed.split(/\r?\n/);
  const headerLine = lines.shift();
  const header = headerLine ? parseCsvLine(headerLine).map((value) => value.trim()) : [];
  const supportedHeaders = [
    ["timestamp", "ip", "port", "onlinePlayers", "maxplayers"],
    ["timestamp", "ip", "port", "onlinePlayers", "maxplayers", "online"],
    ["timestamp", "ip", "port", "hostname", "gamemode", "mapname", "onlinePlayers", "maxplayers"],
    ["timestamp", "ip", "port", "hostname", "gamemode", "mapname", "onlinePlayers", "maxplayers", "online"],
    [
      "timestamp",
      "ip",
      "port",
      "hostname",
      "gamemode",
      "mapname",
      "onlinePlayers",
      "maxplayers",
      "worldtime",
      "weather",
    ],
    [
      "timestamp",
      "ip",
      "port",
      "hostname",
      "gamemode",
      "mapname",
      "onlinePlayers",
      "maxplayers",
      "worldtime",
      "weather",
      "online",
    ],
  ];
  const isKnownHeader = supportedHeaders.some(
    (candidate) => candidate.join(",") === header.join(",")
  );

  if (!isKnownHeader) {
    throw new Error("Unexpected CSV header.");
  }

  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const columns = parseCsvLine(line);
      const isLegacyFormat = columns.length <= 5;
      const isMetadataFormat = columns.length >= 8;
      const isExtendedFormat = columns.length >= 10;
      const isOnlineFormat = columns.length >= 11 || header.includes("online");
      const timestamp = columns[0];
      const ip = columns[1];
      const port = columns[2];
      const hostname = isMetadataFormat ? columns[3] || "" : "";
      const gamemode = isMetadataFormat ? columns[4] || "" : "";
      const mapname = isMetadataFormat ? columns[5] || "" : "";
      const onlinePlayers = isLegacyFormat ? columns[3] : columns[6];
      const maxplayers = isLegacyFormat ? columns[4] : columns[7];
      const worldtime = isExtendedFormat ? columns[8] || "" : "";
      const weather = isExtendedFormat ? columns[9] || "" : "";
      const onlineFlag = isOnlineFormat ? columns[10] : null;

      return {
        timestamp: Number(timestamp),
        ip,
        port: Number(port),
        hostname,
        gamemode,
        mapname,
        onlinePlayers: Number(onlinePlayers),
        maxplayers: Number(maxplayers),
        worldtime,
        weather,
        availability: onlineFlag === null || onlineFlag === undefined || onlineFlag === "" ? null : Number(onlineFlag),
      };
    })
    .filter(
      (row) =>
        row.ip &&
        Number.isFinite(row.timestamp) &&
        Number.isFinite(row.port) &&
        Number.isFinite(row.onlinePlayers) &&
        Number.isFinite(row.maxplayers)
    );
}

function chooseLatestText(entries, fieldName) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const value = entries[index][fieldName];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function buildSnapshotState(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    if (!grouped.has(row.timestamp)) {
      grouped.set(row.timestamp, []);
    }
    grouped.get(row.timestamp).push(row);
  });

  return Array.from(grouped.entries())
    .map(([timestamp, entries]) => {
      const totalPlayers = entries.reduce((sum, entry) => sum + entry.onlinePlayers, 0);
      const activeServers = entries.filter((entry) => entry.onlinePlayers > 0).length;
      // ISSG (Indeks Statistik Server Gabungan): total players across all tracked servers in the snapshot.
      const issg = totalPlayers;

      return {
        timestamp: Number(timestamp),
        entries,
        issg,
        totalPlayers,
        activeServers,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

function buildServerState(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = `${row.ip}:${row.port}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });

  const servers = Array.from(grouped.entries()).map(([id, entries]) => {
    entries.sort((a, b) => a.timestamp - b.timestamp);
    const latest = entries[entries.length - 1];
    const previous = entries.length > 1 ? entries[entries.length - 2] : null;
    const delta = latest.onlinePlayers - (previous ? previous.onlinePlayers : latest.onlinePlayers);
    const occupancy = latest.maxplayers > 0 ? (latest.onlinePlayers / latest.maxplayers) * 100 : 0;

    return {
      id,
      ip: latest.ip,
      port: latest.port,
      entries,
      latest,
      previous,
      delta,
      occupancy,
      hostname: chooseLatestText(entries, "hostname"),
      gamemode: chooseLatestText(entries, "gamemode"),
      mapname: chooseLatestText(entries, "mapname"),
      worldtime: chooseLatestText(entries, "worldtime"),
      weather: chooseLatestText(entries, "weather"),
    };
  });

  servers.sort((a, b) => {
    if (b.latest.onlinePlayers !== a.latest.onlinePlayers) {
      return b.latest.onlinePlayers - a.latest.onlinePlayers;
    }
    return a.id.localeCompare(b.id);
  });

  return servers;
}

function buildMonthlyLeaderboardState(rows) {
  const groupedByMonth = new Map();

  rows.forEach((row) => {
    const monthKey = toMonthKey(row.timestamp);
    if (!groupedByMonth.has(monthKey)) {
      groupedByMonth.set(monthKey, new Map());
    }
    const monthGroup = groupedByMonth.get(monthKey);
    const serverId = `${row.ip}:${row.port}`;
    if (!monthGroup.has(serverId)) {
      monthGroup.set(serverId, []);
    }
    monthGroup.get(serverId).push(row);
  });

  const months = Array.from(groupedByMonth.keys()).sort((left, right) => right.localeCompare(left));
  const leaderboardByMonth = new Map();

  months.forEach((monthKey) => {
    const serverRows = Array.from(groupedByMonth.get(monthKey).entries()).map(([id, entries]) => {
      entries.sort((a, b) => a.timestamp - b.timestamp);
      const peakEntry = entries.reduce(
        (best, entry) => {
          if (!best) {
            return entry;
          }
          if (Number(entry.onlinePlayers) > Number(best.onlinePlayers)) {
            return entry;
          }
          if (
            Number(entry.onlinePlayers) === Number(best.onlinePlayers) &&
            Number(entry.timestamp) > Number(best.timestamp)
          ) {
            return entry;
          }
          return best;
        },
        null
      );
      const latest = entries[entries.length - 1];
      const peakPlayers = Number(peakEntry?.onlinePlayers || 0);
      const capacity = Number(latest?.maxplayers || peakEntry?.maxplayers || 0);
      const avgPlayers = entries.length
        ? entries.reduce((sum, entry) => sum + Number(entry.onlinePlayers || 0), 0) / entries.length
        : 0;

      return {
        id,
        ip: latest?.ip || peakEntry?.ip || "",
        port: Number(latest?.port || peakEntry?.port || 0),
        entries,
        latest,
        hostname: chooseLatestText(entries, "hostname"),
        gamemode: chooseLatestText(entries, "gamemode"),
        mapname: chooseLatestText(entries, "mapname"),
        worldtime: chooseLatestText(entries, "worldtime"),
        weather: chooseLatestText(entries, "weather"),
        peakPlayers,
        peakEntry,
        monthlyCapacity: capacity,
        avgPlayers,
        sampleCount: entries.length,
        lastSeenTimestamp: Number(latest?.timestamp || 0),
      };
    });

    serverRows.sort((a, b) => {
      if (b.peakPlayers !== a.peakPlayers) {
        return b.peakPlayers - a.peakPlayers;
      }
      if (b.monthlyCapacity !== a.monthlyCapacity) {
        return b.monthlyCapacity - a.monthlyCapacity;
      }
      return a.id.localeCompare(b.id);
    });

    leaderboardByMonth.set(monthKey, serverRows);
  });

  return {
    months,
    leaderboardByMonth,
  };
}

function getServerDisplayName(server) {
  return server.hostname || server.id;
}

function getServerSubtitle(server) {
  return server.hostname ? `${server.ip}:${server.port}` : "";
}

function getRangeLabel(rangeKey) {
  return RANGE_OPTIONS.find((option) => option.key === rangeKey)?.label || "All";
}

function getRangeSeconds(rangeKey) {
  if (rangeKey === "all") {
    return null;
  }
  return RANGE_OPTIONS.find((option) => option.key === rangeKey)?.seconds ?? null;
}

function getBaselineIndexForRange(items, rangeKey) {
  if (!items?.length) {
    return -1;
  }

  // Keep legacy behavior for "All": compare latest vs previous snapshot.
  if (rangeKey === "all") {
    return items.length > 1 ? items.length - 2 : items.length - 1;
  }

  const rangeSeconds = getRangeSeconds(rangeKey);
  if (!rangeSeconds) {
    return items.length > 1 ? items.length - 2 : items.length - 1;
  }

  const latestTimestamp = Number(items[items.length - 1].timestamp) || 0;
  const cutoff = latestTimestamp - rangeSeconds;

  // Baseline: closest point at-or-before the cutoff; fallback to first point inside the window.
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (Number(items[index].timestamp) <= cutoff) {
      return index;
    }
  }
  return 0;
}

function getRangeDelta(items, rangeKey, valueAccessor) {
  if (!items?.length) {
    return 0;
  }

  const latest = items[items.length - 1];
  const baselineIndex = getBaselineIndexForRange(items, rangeKey);
  const baseline = baselineIndex >= 0 ? items[baselineIndex] : latest;

  const latestValue = Number(valueAccessor(latest) || 0);
  const baselineValue = Number(valueAccessor(baseline) || 0);
  return latestValue - baselineValue;
}

function updateDeltaHeader() {
  if (!elements.deltaHeader) {
    return;
  }
  if (state.leaderboardMode === "tracked") {
    elements.deltaHeader.textContent = "AVG";
    return;
  }
  const label = getRangeLabel(state.selectedRange);
  elements.deltaHeader.textContent = state.selectedRange === "all" ? "Delta" : `Delta (${label})`;
}

function updateLeaderboardHeaders() {
  if (!elements.playersHeader || !elements.capacityHeader || !elements.leaderboardTitle) {
    return;
  }
  if (state.leaderboardMode === "tracked") {
    const monthLabel = formatMonthLabel(state.selectedLeaderboardMonth);
    elements.leaderboardTitle.textContent = `Tracked Leaders (${monthLabel})`;
    elements.playersHeader.textContent = "On Ic";
    elements.capacityHeader.textContent = "Max Ic";
    if (elements.leaderboardMeta) {
      const monthCount = state.availableLeaderboardMonths.length;
      const suffix =
        monthCount <= 1
          ? "Saat ini baru ada 1 bulan data yang tersedia, jadi dropdown bulan belum punya opsi pembanding lain."
          : "Pilih bulan lain dari dropdown untuk membandingkan raja server di periode yang berbeda.";
      elements.leaderboardMeta.textContent =
        `${monthLabel} dibaca dari seluruh snapshot pada bulan tersebut dan diurutkan berdasarkan peak player tertinggi. ${suffix}`;
    }
    return;
  }
  elements.leaderboardTitle.textContent = "Current Leaders (Peringkat Saat Ini)";
  elements.playersHeader.textContent = "Players";
  elements.capacityHeader.textContent = "Capacity";
  if (elements.leaderboardMeta) {
    elements.leaderboardMeta.textContent =
      "Realtime mode menampilkan leaderboard berdasarkan snapshot terbaru.";
  }
}

function updateLeaderboardMonthOptions() {
  if (!elements.leaderboardMonth) {
    return;
  }
  const currentValue = state.selectedLeaderboardMonth;
  elements.leaderboardMonth.innerHTML = "";

  if (!state.availableLeaderboardMonths.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Belum ada data bulanan";
    elements.leaderboardMonth.appendChild(option);
    state.selectedLeaderboardMonth = "";
    return;
  }

  state.availableLeaderboardMonths.forEach((monthKey) => {
    const option = document.createElement("option");
    option.value = monthKey;
    option.textContent = formatMonthLabel(monthKey);
    elements.leaderboardMonth.appendChild(option);
  });

  const nextValue = state.availableLeaderboardMonths.includes(currentValue)
    ? currentValue
    : state.availableLeaderboardMonths[0];
  state.selectedLeaderboardMonth = nextValue || "";
  elements.leaderboardMonth.value = state.selectedLeaderboardMonth;
}

function updateLeaderboardRows() {
  if (state.leaderboardMode === "tracked") {
    state.leaderboardRows = state.monthlyLeaderboardByMonth?.get(state.selectedLeaderboardMonth) || [];
  } else {
    state.leaderboardRows = [...state.servers];
  }
}

function updateLeaderboardControls() {
  if (elements.leaderboardMode) {
    elements.leaderboardMode.value = state.leaderboardMode;
  }
  if (elements.leaderboardMonth) {
    const isTracked = state.leaderboardMode === "tracked";
    elements.leaderboardMonth.disabled = !isTracked || !state.availableLeaderboardMonths.length;
    elements.leaderboardMonth.title =
      isTracked && state.availableLeaderboardMonths.length <= 1
        ? "Baru ada satu bulan data yang tersedia saat ini."
        : "";
  }
  updateLeaderboardHeaders();
  updateDeltaHeader();
}

function getChartSeriesOptions() {
  const options = [];

  if (state.snapshots.length) {
    options.push({
      value: ISSG_ID,
      text: "ISSG (Indeks Gabungan)",
      searchText: "issg indeks gabungan global",
    });
  }

  state.servers.forEach((server) => {
    const primaryLabel = getServerDisplayName(server);
    const secondaryLabel = getServerSubtitle(server);
    options.push({
      value: server.id,
      text: `${primaryLabel} | ${server.latest.onlinePlayers}`,
      searchText: [
        primaryLabel,
        secondaryLabel,
        server.id,
        server.gamemode,
        server.mapname,
        server.worldtime,
        formatWeather(server.weather),
      ]
        .join(" ")
        .toLowerCase(),
    });
  });

  return options;
}

function filterByRange(items, rangeKey) {
  if (!items.length || rangeKey === "all") {
    return items;
  }

  const range = RANGE_OPTIONS.find((option) => option.key === rangeKey);
  if (!range || range.seconds === null) {
    return items;
  }

  const latestTimestamp = items[items.length - 1].timestamp;
  const cutoff = latestTimestamp - range.seconds;
  const filtered = items.filter((item) => item.timestamp >= cutoff);
  return filtered.length ? filtered : items.slice(-1);
}

function getServerDeltaForRange(server, rangeKey) {
  const entries = server?.entries || [];
  if (!entries.length) {
    return 0;
  }

  const latest = entries[entries.length - 1];
  const rangeSeconds = getRangeSeconds(rangeKey);

  // For "All", keep legacy behavior: delta between the two latest snapshots.
  if (!rangeSeconds) {
    const previous = entries.length > 1 ? entries[entries.length - 2] : latest;
    return Number(latest.onlinePlayers || 0) - Number(previous.onlinePlayers || 0);
  }

  const rangeStart = latest.timestamp - rangeSeconds;

  // Baseline: closest point at-or-before the start of the window; fallback to earliest inside the window.
  let baseline = null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].timestamp <= rangeStart) {
      baseline = entries[index];
      break;
    }
  }
  if (!baseline) {
    baseline = entries.find((entry) => entry.timestamp >= rangeStart) || entries[0];
  }

  return Number(latest.onlinePlayers || 0) - Number(baseline.onlinePlayers || 0);
}

function formatWeather(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "N/A";
  }

  if (/^-?\d+$/.test(raw)) {
    const code = Number(raw);
    return WEATHER_LABELS[code] ? `${WEATHER_LABELS[code]} (${code})` : `Code ${code}`;
  }

  return raw;
}

function formatServerTime(value) {
  const raw = String(value || "").trim();
  return raw || "N/A";
}

function syncWeatherAxisVisibility(chartInstance) {
  if (!chartInstance?.options?.scales?.weather) {
    return;
  }

  const hasVisibleWeatherDataset = chartInstance.data.datasets.some((dataset, index) => {
    if (dataset.yAxisID !== "weather") {
      return false;
    }
    return chartInstance.isDatasetVisible(index);
  });

  chartInstance.options.scales.weather.display = hasVisibleWeatherDataset;
}

function getWeatherCode(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }

  const mappedCode = WEATHER_NAME_TO_CODE[raw.toLowerCase()];
  return Number.isFinite(mappedCode) ? mappedCode : null;
}

function getWeatherScaleConfig(items, hasWeatherDataset) {
  if (!hasWeatherDataset) {
    return {
      display: false,
      position: "right",
      beginAtZero: true,
      grid: {
        drawOnChartArea: false,
      },
    };
  }

  const weatherValues = items
    .map((entry) => getWeatherCode(entry.weather))
    .filter((value) => Number.isFinite(value));

  if (!weatherValues.length) {
    return {
      display: false,
      position: "right",
      beginAtZero: true,
      grid: {
        drawOnChartArea: false,
      },
    };
  }

  const uniqueValues = [...new Set(weatherValues)].sort((left, right) => left - right);
  let min = uniqueValues[0];
  let max = uniqueValues[uniqueValues.length - 1];

  if (min === max) {
    min -= 1;
    max += 1;
  }

  return {
    display: true,
    position: "right",
    min,
    max,
    ticks: {
      color: "#7dd3fc",
      stepSize: 1,
      callback(value) {
        const numericValue = Number(value);
        if (!Number.isInteger(numericValue)) {
          return "";
        }
        return WEATHER_LABELS[numericValue] ? `${WEATHER_LABELS[numericValue]} (${numericValue})` : "";
      },
    },
    grid: {
      drawOnChartArea: false,
    },
  };
}

function getPrimaryScaleConfig(datasets, visibilityResolver = (_, dataset) => !dataset.hidden) {
  const visiblePrimaryDatasets = datasets.filter(
    (dataset, index) => dataset.yAxisID === "y" && visibilityResolver(index, dataset)
  );
  const preferredValues = visiblePrimaryDatasets
    .filter((dataset) => dataset.drivesScaleMax)
    .flatMap((dataset) => dataset.data)
    .filter((value) => Number.isFinite(value));
  const fallbackValues = visiblePrimaryDatasets
    .flatMap((dataset) => dataset.data)
    .filter((value) => Number.isFinite(value));
  const values = preferredValues.length ? preferredValues : fallbackValues;
  const maxValue = values.length ? Math.max(...values) : 1;

  return {
    beginAtZero: true,
    max: maxValue > 0 ? maxValue : 1,
    ticks: {
      color: "#94a3b8",
      precision: 0,
    },
    grid: {
      color: "rgba(148, 163, 184, 0.12)",
    },
  };
}

function computeStandardDeviation(values) {
  if (values.length <= 1) {
    return 0;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function getLatestSnapshotTimestamp() {
  if (state.snapshots?.length) {
    return state.snapshots[state.snapshots.length - 1].timestamp;
  }
  return state.rows.reduce((max, row) => Math.max(max, row.timestamp), 0);
}

function filterEntriesByLastDays(entries, latestTimestamp, days) {
  const windowSeconds = days * 24 * 60 * 60;
  const start = latestTimestamp - windowSeconds;
  return (entries || []).filter((entry) => entry.timestamp >= start && entry.timestamp <= latestTimestamp);
}

function getPopulationEntries(entries) {
  const items = entries || [];
  const hasAvailabilityFlag = items.some(
    (entry) => entry?.availability === 0 || entry?.availability === 1
  );
  if (hasAvailabilityFlag) {
    return {
      entries: items.filter((entry) => entry?.availability !== 0),
      mode: "online-flag",
    };
  }

  // Fallback for old CSVs (no online/offline flag):
  // treat 0 players as "not population" to avoid mixing OFF/ON into population stats.
  return {
    entries: items.filter((entry) => Number(entry?.onlinePlayers) > 0 || Number(entry?.maxplayers) === 0),
    mode: "zero-filter",
  };
}

function getCompareServerOptions() {
  return state.servers.map((server) => {
    const subtitle = getServerSubtitle(server);
    const text = `${getServerDisplayName(server)}${subtitle ? ` (${subtitle})` : ""}`;
    return {
      value: server.id,
      text,
      searchText: [
        server.id,
        getServerDisplayName(server),
        subtitle,
        server.gamemode,
        server.mapname,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });
}

function setSelectOptions(selectElement, options, emptyText) {
  if (!selectElement) {
    return;
  }
  selectElement.innerHTML = "";
  if (!options.length) {
    const option = document.createElement("option");
    option.textContent = emptyText;
    option.value = "";
    selectElement.appendChild(option);
    return;
  }
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.text;
    selectElement.appendChild(option);
  });
}

function chooseDefaultCompareIds() {
  if (!state.servers.length) {
    state.compareServerAId = null;
    state.compareServerBId = null;
    return;
  }
  if (!state.compareServerAId) {
    state.compareServerAId = state.servers[0]?.id || null;
  }
  if (!state.compareServerBId) {
    state.compareServerBId = state.servers[1]?.id || state.servers[0]?.id || null;
  }
}

function updateCompareOptions() {
  if (!elements.compareSelectA || !elements.compareSelectB) {
    return;
  }

  chooseDefaultCompareIds();
  const options = getCompareServerOptions();
  const optionValues = new Set(options.map((item) => item.value));

  const updateSide = ({ query, selectElement, currentValue, setValue, fallbackValue }) => {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const visibleOptions = normalizedQuery
      ? options.filter((option) => option.searchText.includes(normalizedQuery))
      : options;

    if (!options.length) {
      setSelectOptions(selectElement, [], "No servers available");
      setValue(null);
      return;
    }

    if (!visibleOptions.length) {
      setSelectOptions(selectElement, [], "No matching servers");
      setValue(null);
      return;
    }

    setSelectOptions(selectElement, visibleOptions, "No matching servers");

    let nextValue = currentValue;
    if (!nextValue || !optionValues.has(nextValue)) {
      nextValue = fallbackValue;
    }
    if (!visibleOptions.some((option) => option.value === nextValue)) {
      nextValue = visibleOptions[0].value;
    }

    selectElement.value = nextValue || "";
    setValue(selectElement.value || null);
  };

  updateSide({
    query: state.compareSearchQueryA,
    selectElement: elements.compareSelectA,
    currentValue: state.compareServerAId,
    setValue: (value) => {
      state.compareServerAId = value;
    },
    fallbackValue: state.compareServerAId || state.servers[0]?.id || null,
  });

  updateSide({
    query: state.compareSearchQueryB,
    selectElement: elements.compareSelectB,
    currentValue: state.compareServerBId,
    setValue: (value) => {
      state.compareServerBId = value;
    },
    fallbackValue: state.compareServerBId || state.servers[1]?.id || state.servers[0]?.id || null,
  });
}

function computeCompareModel(server, latestTimestamp) {
  const windowDays = 30;
  const entriesInRange = filterEntriesByLastDays(server?.entries || [], latestTimestamp, windowDays);
  const populationResult = getPopulationEntries(entriesInRange);
  const populationEntries = populationResult.entries;
  const first = populationEntries[0] || null;
  const last = populationEntries.length ? populationEntries[populationEntries.length - 1] : null;
  const values = populationEntries.map((entry) => Number(entry.onlinePlayers)).filter((value) => Number.isFinite(value));

  const sampleCount = values.length;
  const spanDaysRaw = first && last ? (last.timestamp - first.timestamp) / (24 * 60 * 60) : 0;
  const spanDays = Number.isFinite(spanDaysRaw) ? Math.max(spanDaysRaw, 0) : 0;
  const coverageLabel = sampleCount
    ? `Data: ${sampleCount} sampel | ${Math.min(30, Math.max(1, Math.round(spanDays || 1)))} / 30 hari`
    : "Data: belum cukup";

  const avg = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const peak = values.length ? Math.max(...values) : null;
  const floor = values.length ? Math.min(...values) : null;
  const speedPerDay =
    first && last && Number.isFinite(first.onlinePlayers) && Number.isFinite(last.onlinePlayers) && spanDays > 0
      ? (Number(last.onlinePlayers) - Number(first.onlinePlayers)) / spanDays
      : null;
  const deviation = values.length ? computeStandardDeviation(values) : null;
  const stability =
    avg && Number.isFinite(avg) && avg > 0 && deviation !== null && Number.isFinite(deviation)
      ? (deviation / avg) * 100
      : null;

  return {
    coverageLabel,
    populationMode: populationResult.mode,
    metrics: {
      speedPerDay,
      avg,
      peak,
      floor,
      stability,
      maxplayers: Number(server?.latest?.maxplayers ?? 0),
    },
  };
}

function formatCompareValue(value, { decimals = 0 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }
  if (decimals > 0) {
    return Number(value).toFixed(decimals);
  }
  return formatNumber(Math.round(Number(value)));
}

function getCompareTone(aValue, bValue, higherIsBetter) {
  if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) {
    return { a: "neutral", b: "neutral" };
  }
  const diff = Number(aValue) - Number(bValue);
  if (Math.abs(diff) < 1e-9) {
    return { a: "tie", b: "tie" };
  }
  const aWins = higherIsBetter ? diff > 0 : diff < 0;
  return { a: aWins ? "up" : "down", b: aWins ? "down" : "up" };
}

function renderCompare() {
  if (!elements.compareStats) {
    return;
  }

  if (!state.servers.length) {
    elements.compareStats.innerHTML = `<div class="compare-empty-state">Belum ada data server untuk dibandingkan.</div>`;
    return;
  }

  const serverA = state.servers.find((server) => server.id === state.compareServerAId) || null;
  const serverB = state.servers.find((server) => server.id === state.compareServerBId) || null;

  if (!serverA || !serverB) {
    elements.compareStats.innerHTML = `<div class="compare-empty-state">Pilih Server A dan Server B untuk mulai compare.</div>`;
    return;
  }

  const latestTimestamp = getLatestSnapshotTimestamp();
  const modelA = computeCompareModel(serverA, latestTimestamp);
  const modelB = computeCompareModel(serverB, latestTimestamp);

  if (elements.compareNote) {
    const modeNote =
      modelA.populationMode === "zero-filter" || modelB.populationMode === "zero-filter"
        ? " (CSV lama: 0 dianggap OFF)"
        : "";
    elements.compareNote.textContent = `Range tetap: 30 hari terakhir${modeNote}. ${modelA.coverageLabel} | ${modelB.coverageLabel}`;
  }

  const nameA = escapeHtml(getServerDisplayName(serverA));
  const nameB = escapeHtml(getServerDisplayName(serverB));

  const rows = [
    { key: "speedPerDay", label: "Kecepatan naik (per hari)", higherIsBetter: true, decimals: 2 },
    { key: "avg", label: "Rata-rata player", higherIsBetter: true, decimals: 0 },
    { key: "peak", label: "Tertinggi (peak)", higherIsBetter: true, decimals: 0 },
    { key: "floor", label: "Terendah (floor)", higherIsBetter: true, decimals: 0 },
    { key: "stability", label: "Stabilitas (naik-turun %)", higherIsBetter: false, decimals: 2 },
    { key: "maxplayers", label: "Max player (capacity)", higherIsBetter: true, decimals: 0 },
  ];

  const gridCells = [];
  gridCells.push(`<div class="compare-head"></div>`);
  gridCells.push(`<div class="compare-head">${nameA}</div>`);
  gridCells.push(`<div class="compare-head">${nameB}</div>`);
  gridCells.push(`<div class="compare-divider"></div>`);

  rows.forEach((row) => {
    const aValue = modelA.metrics[row.key];
    const bValue = modelB.metrics[row.key];
    const tones = getCompareTone(aValue, bValue, row.higherIsBetter);
    const aText = formatCompareValue(aValue, { decimals: row.decimals });
    const bText = formatCompareValue(bValue, { decimals: row.decimals });

    gridCells.push(`<div class="compare-label">${escapeHtml(row.label)}</div>`);
    gridCells.push(`<div class="compare-value ${tones.a}">${escapeHtml(aText)}</div>`);
    gridCells.push(`<div class="compare-value ${tones.b}">${escapeHtml(bText)}</div>`);
  });

  elements.compareStats.innerHTML = gridCells.join("");
}

function computeMedian(values) {
  const numeric = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (!numeric.length) {
    return 0;
  }
  const middleIndex = Math.floor(numeric.length / 2);
  if (numeric.length % 2 === 1) {
    return numeric[middleIndex];
  }
  return (numeric[middleIndex - 1] + numeric[middleIndex]) / 2;
}

function getSamplingIntervalSeconds(items) {
  if (!items || items.length <= 1) {
    return 0;
  }
  const deltas = [];
  for (let index = 1; index < items.length; index += 1) {
    const delta = Number(items[index].timestamp) - Number(items[index - 1].timestamp);
    if (Number.isFinite(delta) && delta > 0) {
      deltas.push(delta);
    }
  }
  return computeMedian(deltas);
}

function buildServerTimeline(server, rangeKey) {
  const snapshotsInRange = filterByRange(state.snapshots, rangeKey);
  if (!snapshotsInRange.length) {
    return [];
  }

  const entriesByTimestamp = new Map();
  (server?.entries || []).forEach((entry) => {
    entriesByTimestamp.set(entry.timestamp, entry);
  });

  let lastMaxplayers = 0;
  return snapshotsInRange.map((snapshot) => {
    const entry = entriesByTimestamp.get(snapshot.timestamp);
    if (entry) {
      const maxplayers = Number(entry.maxplayers || 0);
      if (Number.isFinite(maxplayers) && maxplayers > 0) {
        lastMaxplayers = maxplayers;
      }
      const hasExplicitAvailability = entry.availability === 0 || entry.availability === 1;
      const isExplicitOffline = entry.availability === 0;
      const isHeuristicOffline =
        !hasExplicitAvailability && Number(entry.onlinePlayers) === 0 && Number(entry.maxplayers) > 0;
      const availability = isExplicitOffline || isHeuristicOffline ? 0 : 1;
      return {
        timestamp: snapshot.timestamp,
        onlinePlayers: availability ? Number(entry.onlinePlayers) : null,
        maxplayers: Number(entry.maxplayers || lastMaxplayers || 0),
        weather: entry.weather ?? "",
        availability,
      };
    }
    return {
      timestamp: snapshot.timestamp,
      onlinePlayers: null,
      maxplayers: Number(lastMaxplayers || 0),
      weather: "",
      availability: 0,
    };
  });
}

function analyzeAvailabilityTimeline(timelineItems, samplingIntervalSeconds) {
  const TEN_MINUTES = 10 * 60;
  const ONE_HOUR = 60 * 60;
  const THREE_DAYS = 3 * 24 * 60 * 60;
  const interval =
    Number.isFinite(samplingIntervalSeconds) && samplingIntervalSeconds > 0 ? samplingIntervalSeconds : 0;

  if (!timelineItems?.length || !interval) {
    return {
      status: "N/A",
      uptimePercent: 0,
      offlineSecondsTotal: 0,
      currentOffSeconds: 0,
      restartCount: 0,
      maintenanceCount: 0,
      outageCount: 0,
      migrationFlag: false,
      lastSeenTimestamp: 0,
    };
  }

  const onlineCount = timelineItems.reduce((sum, item) => sum + (item.availability ? 1 : 0), 0);
  const uptimePercent = (onlineCount / timelineItems.length) * 100;

  let offlineSecondsTotal = 0;
  let restartCount = 0;
  let maintenanceCount = 0;
  let outageCount = 0;

  let currentOffSeconds = 0;
  let lastSeenTimestamp = 0;
  let offlineRun = 0;

  for (let index = 0; index < timelineItems.length; index += 1) {
    const item = timelineItems[index];
    if (item.availability) {
      lastSeenTimestamp = item.timestamp;
      if (offlineRun > 0) {
        const downtime = offlineRun * interval;
        offlineSecondsTotal += downtime;
        if (downtime <= TEN_MINUTES) {
          restartCount += 1;
        } else if (downtime <= ONE_HOUR) {
          maintenanceCount += 1;
        } else {
          outageCount += 1;
        }
        offlineRun = 0;
      }
    } else {
      offlineRun += 1;
    }
  }

  if (offlineRun > 0) {
    const downtime = offlineRun * interval;
    offlineSecondsTotal += downtime;
    currentOffSeconds = downtime;
    if (downtime <= TEN_MINUTES) {
      restartCount += 1;
    } else if (downtime <= ONE_HOUR) {
      maintenanceCount += 1;
    } else {
      outageCount += 1;
    }
  }

  const latest = timelineItems[timelineItems.length - 1];
  const status = latest.availability ? "ONLINE" : `OFFLINE ${formatDuration(currentOffSeconds)}`;
  const migrationFlag = !latest.availability && currentOffSeconds >= THREE_DAYS;

  return {
    status,
    uptimePercent,
    offlineSecondsTotal,
    currentOffSeconds,
    restartCount,
    maintenanceCount,
    outageCount,
    migrationFlag,
    lastSeenTimestamp,
  };
}

function getPeakWindowLabel(items) {
  if (!items.length) {
    return "N/A";
  }

  const buckets = new Map();
  items.forEach((item) => {
    const parts = getDateParts(item.timestamp);
    const hour = Number(parts.hour);
    if (!Number.isFinite(hour)) {
      return;
    }

    if (!buckets.has(hour)) {
      buckets.set(hour, []);
    }

    const bucketValue = item.onlinePlayers ?? item.issg ?? 0;
    buckets.get(hour).push(bucketValue);
  });

  let bestHour = null;
  let bestScore = -Infinity;
  buckets.forEach((values, hour) => {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (average > bestScore) {
      bestScore = average;
      bestHour = hour;
    }
  });

  if (bestHour === null) {
    return "N/A";
  }

  const start = String(bestHour).padStart(2, "0");
  const end = String((bestHour + 2) % 24).padStart(2, "0");
  return `${start}.00-${end}.00 WIB`;
}

function analyzeAvailability(entries, latestTimestamp, samplingIntervalSeconds) {
  const TEN_MINUTES = 10 * 60;
  const ONE_HOUR = 60 * 60;
  const THREE_DAYS = 3 * 24 * 60 * 60;
  const interval = Number.isFinite(samplingIntervalSeconds) && samplingIntervalSeconds > 0 ? samplingIntervalSeconds : 0;

  if (!entries?.length || !Number.isFinite(latestTimestamp) || latestTimestamp <= 0) {
    return {
      currentOffSeconds: 0,
      lastSeenTimestamp: 0,
      restartCount: 0,
      updateCount: 0,
      longOffCount: 0,
      migrationFlag: false,
      notes: "Belum cukup data untuk analisis availability.",
    };
  }

  const lastSeenTimestamp = Number(entries[entries.length - 1].timestamp) || 0;
  const currentOffSeconds = Math.max(0, latestTimestamp - lastSeenTimestamp);

  let restartCount = 0;
  let updateCount = 0;
  let longOffCount = 0;

  for (let index = 1; index < entries.length; index += 1) {
    const previous = Number(entries[index - 1].timestamp) || 0;
    const current = Number(entries[index].timestamp) || 0;
    const gap = current - previous;
    if (!Number.isFinite(gap) || gap <= 0) {
      continue;
    }

    // Approximate downtime beyond expected sampling interval.
    const downtime = Math.max(0, interval ? gap - interval : gap);
    if (downtime <= 0) {
      continue;
    }

    if (downtime <= TEN_MINUTES) {
      restartCount += 1;
    } else if (downtime <= ONE_HOUR) {
      updateCount += 1;
    } else {
      longOffCount += 1;
    }
  }

  const migrationFlag = currentOffSeconds >= THREE_DAYS;
  return {
    currentOffSeconds,
    lastSeenTimestamp,
    restartCount,
    updateCount,
    longOffCount,
    migrationFlag,
    notes: "",
  };
}

function getAlertInsight(deltaPercent) {
  if (deltaPercent <= -25) {
    return {
      title: "Drop Alert (Alarm Turun)",
      value: `${formatSignedPercent(deltaPercent)}`,
      detail: "Penurunan tajam terdeteksi. Cek kemungkinan restart, event selesai, atau churn mendadak.",
      tone: "down",
    };
  }

  if (deltaPercent >= 25) {
    return {
      title: "Spike Alert (Alarm Lonjakan)",
      value: `${formatSignedPercent(deltaPercent)}`,
      detail: "Lonjakan cepat terdeteksi. Bisa jadi efek promo, event, atau serbuan komunitas.",
      tone: "up",
    };
  }

  return {
    title: "Flow Alert (Arus Pemain)",
    value: `${formatSignedPercent(deltaPercent)}`,
    detail: "Belum ada perubahan ekstrem. Traffic masih berada di zona normal.",
    tone: "neutral",
  };
}

function buildInsights(selectedSeries) {
  if (!selectedSeries || !selectedSeries.items.length) {
    return {
      headlines: [],
      summary:
        "Belum ada data cukup untuk membuat insight. Muat CSV dulu lalu pilih server atau ISSG yang ingin dianalisis.",
      cards: [],
    };
  }

  const items = selectedSeries.items;
  const populationItems =
    selectedSeries.type === "server" ? getPopulationEntries(items).entries : items;
  if (!populationItems.length) {
    return {
      headlines: [],
      summary: "Data populasi belum cukup pada rentang ini.",
      cards: [],
    };
  }

  const values = populationItems.map((item) =>
    selectedSeries.type === "issg" ? Number(item.issg || 0) : Number(item.onlinePlayers || 0)
  );
  const numericValues = values.filter((value) => Number.isFinite(value));
  const dataQualityNote =
    selectedSeries.type === "server" && numericValues.length < 2
      ? " Catatan: data tipis (cuma 1 sampel), jadi trend/volatility bisa terbaca 0."
      : "";
  const avgValue = numericValues.length
    ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    : 0;
  const minValue = numericValues.length ? Math.min(...numericValues) : 0;
  const maxValue = numericValues.length ? Math.max(...numericValues) : 0;
  const formatSeriesStat = (value) =>
    selectedSeries.type === "issg" ? formatNumber(Math.round(Number(value) || 0)) : formatNumber(Math.round(Number(value) || 0));
  const statNoun =
    selectedSeries.type === "issg" ? "total pemain" : "On IC";

  const latestValue = values[values.length - 1] ?? 0;
  const baselineValue =
    state.selectedRange === "all"
      ? (values.length > 1 ? values[values.length - 2] : latestValue)
      : (values[0] ?? latestValue);
  const deltaValue = latestValue - baselineValue;
  const deltaPercent = baselineValue === 0 ? 0 : (deltaValue / baselineValue) * 100;
  const latestItem = populationItems[populationItems.length - 1];
  const baselineItem =
    state.selectedRange === "all"
      ? (populationItems.length > 1 ? populationItems[populationItems.length - 2] : latestItem)
      : (populationItems[0] ?? latestItem);
  const elapsedHours = Math.max((latestItem.timestamp - baselineItem.timestamp) / 3600, 1 / 60);
  const growthPerHour = deltaValue / elapsedHours;
  const percentChanges = [];

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    const change = previous === 0 ? 0 : ((current - previous) / previous) * 100;
    percentChanges.push(change);
  }

  const volatilityScore = computeStandardDeviation(percentChanges);
  const volatilityLabel =
    volatilityScore >= 18 ? "High" : volatilityScore >= 8 ? "Medium" : "Low";
  const peakWindow = getPeakWindowLabel(populationItems);

  // Replace capacity-based scoring with "activity level" relative to the selected range.
  const activityPercent = maxValue > 0 ? clamp((latestValue / maxValue) * 100, 0, 100) : 0;

  const growthScore = clamp(50 + deltaPercent * 1.2, 0, 100);
  const stabilityScore = clamp(100 - volatilityScore * 3.2, 0, 100);
  const healthScore = Math.round(growthScore * 0.4 + stabilityScore * 0.35 + activityPercent * 0.25);
  const momentumLabel =
    deltaPercent >= 10 ? "Accelerating" : deltaPercent > 0 ? "Growing" : deltaPercent <= -10 ? "Sliding" : "Flat";

  const alertInsight = getAlertInsight(deltaPercent);
  const subjectLabel =
    selectedSeries.type === "issg"
      ? "ISSG (market SA-MP)"
      : getServerDisplayName(state.servers.find((server) => server.id === selectedSeries.id) || { id: selectedSeries.label, hostname: selectedSeries.label });
  const summary =
    `${subjectLabel} sedang ${momentumLabel.toLowerCase()} dengan perubahan ${formatSignedPercent(deltaPercent)} ` +
    `pada rentang ${getRangeLabel(state.selectedRange)}. Peak window terbaca di ${peakWindow}, ` +
    `volatility berada di level ${volatilityLabel.toLowerCase()}, dan health score saat ini ${healthScore}/100.` +
    dataQualityNote;

  const rangeLabel = getRangeLabel(state.selectedRange);
  const alertLabel = String(alertInsight.title || "").split("(")[0].trim() || "Alert";
  const headlineSubject =
    selectedSeries.type === "issg" ? "Market" : "Server";
  const headlines = [
    `${headlineSubject}: ${subjectLabel} ${momentumLabel.toLowerCase()} ${formatSignedPercent(deltaPercent)} (${rangeLabel}).`,
    `Watch: peak ${peakWindow}; volatility ${volatilityLabel.toLowerCase()} (${volatilityScore.toFixed(2)}).`,
    `Health: ${healthScore}/100. ${alertLabel}.`,
  ];

  const availabilityCards = [];
  if (selectedSeries.type === "server") {
    const server = state.servers.find((candidate) => candidate.id === selectedSeries.id);
    const timelineItems = selectedSeries.timelineItems || buildServerTimeline(server, state.selectedRange);
    const snapshotsInRange = filterByRange(state.snapshots, state.selectedRange);
    const samplingIntervalSeconds = getSamplingIntervalSeconds(snapshotsInRange);
    const availability = analyzeAvailabilityTimeline(timelineItems, samplingIntervalSeconds);
    const sampleNote = samplingIntervalSeconds ? ` (update data kira-kira tiap ${formatDuration(samplingIntervalSeconds)})` : "";
    const rangeInfo = `${rangeLabel}${sampleNote}`;
    const migrationNote = availability.migrationFlag ? " Flag: kemungkinan ganti IP/server (off > 3 hari)." : "";

    availabilityCards.push({
      title: "Availability (Uptime + Downtime)",
      value: `${availability.status} | Uptime ${availability.uptimePercent.toFixed(0)}%`,
      detail:
        `Dalam ${rangeInfo}: downtime total ${formatDuration(availability.offlineSecondsTotal)}. ` +
        `Restart cepat: ${availability.restartCount}x, Maintenance: ${availability.maintenanceCount}x, Down lama: ${availability.outageCount}x. ` +
        `Terakhir terlihat: ${availability.lastSeenTimestamp ? formatSnapshotTimestamp(availability.lastSeenTimestamp) : "N/A"}.` +
        migrationNote,
      tone: availability.migrationFlag || availability.status.startsWith("OFFLINE") ? "down" : "up",
    });
  }

  return {
    headlines,
    summary,
    cards: [
      ...availabilityCards,
      {
        title: "Average (Rata-rata)",
        value: formatSeriesStat(avgValue),
        detail: `Rata-rata ${statNoun} pada rentang ${getRangeLabel(state.selectedRange)}.`,
        tone: "neutral",
      },
      {
        title: "High (Tertinggi)",
        value: formatSeriesStat(maxValue),
        detail: `${statNoun[0].toUpperCase()}${statNoun.slice(1)} tertinggi pada rentang ${getRangeLabel(state.selectedRange)}.`,
        tone: "up",
      },
      {
        title: "Low (Terendah)",
        value: formatSeriesStat(minValue),
        detail: `${statNoun[0].toUpperCase()}${statNoun.slice(1)} terendah pada rentang ${getRangeLabel(state.selectedRange)}.`,
        tone: "down",
      },
      {
        title: "Growth Momentum (Momentum Pertumbuhan)",
        value: `${formatSignedPercent(deltaPercent)} | ${growthPerHour.toFixed(2)}/jam`,
        detail: momentumLabel === "Flat"
          ? "Pergerakan cenderung datar. Belum ada akselerasi signifikan."
          : `Status ${momentumLabel.toLowerCase()} berdasarkan awal vs akhir rentang aktif.`,
        tone: deltaPercent > 0 ? "up" : deltaPercent < 0 ? "down" : "neutral",
      },
      {
        title: "Peak Time (Jam Puncak)",
        value: peakWindow,
        detail: "Window dengan rata-rata traffic paling tinggi pada rentang waktu yang sedang dipilih.",
        tone: "neutral",
      },
      {
        title: "Volatility Score (Skor Volatilitas)",
        value: `${volatilityScore.toFixed(2)} | ${volatilityLabel}`,
        detail:
          volatilityLabel === "High"
            ? "Perubahan antar snapshot agresif. Cocok dipantau untuk churn atau event spike."
            : volatilityLabel === "Medium"
              ? "Masih bergerak dinamis tapi belum terlalu liar."
              : "Traffic relatif stabil dan lebih mudah diprediksi.",
        tone: volatilityLabel === "High" ? "down" : volatilityLabel === "Low" ? "up" : "neutral",
      },
      {
        title: alertInsight.title,
        value: alertInsight.value,
        detail: alertInsight.detail,
        tone: alertInsight.tone,
      },
      {
        title: "Health Score (Skor Kesehatan)",
        value: `${healthScore}/100`,
        detail:
          healthScore >= 75
            ? "Kondisi sehat: growth, stabilitas, dan activity level cukup seimbang."
            : healthScore >= 50
              ? "Cukup sehat, tapi masih ada ruang optimasi pada growth atau stabilitas."
              : "Perlu perhatian. Salah satu dari growth, stabilitas, atau activity level sedang lemah.",
        tone: healthScore >= 75 ? "up" : healthScore < 50 ? "down" : "neutral",
      },
    ],
  };
}

function renderInsights() {
  const selectedSeries = getSelectedSeries();
  const insightModel = buildInsights(selectedSeries);

  if (elements.insightPanelLabel) {
    if (!selectedSeries) {
      elements.insightPanelLabel.textContent = "Insights";
    } else if (selectedSeries.type === "issg") {
      elements.insightPanelLabel.textContent = "Market Insights (ISSG)";
    } else {
      elements.insightPanelLabel.textContent = "Owner Insights (Insight Owner)";
    }
  }

  if (elements.insightHeadlines) {
    const headlines = (insightModel.headlines || []).filter(Boolean).slice(0, 3);
    elements.insightHeadlines.innerHTML = headlines.length
      ? headlines.map((headline) => `<li>${escapeHtml(headline)}</li>`).join("")
      : "";
  }

  elements.insightSummary.textContent = insightModel.summary;

  if (!insightModel.cards.length) {
    elements.insightCards.innerHTML = `
      <article class="insight-card">
        <span class="status-label">Insight</span>
        <strong>Data belum cukup</strong>
        <p>Muat data tambahan atau pilih rentang waktu lain untuk menghasilkan insight.</p>
      </article>
    `;
    return;
  }

  elements.insightCards.innerHTML = insightModel.cards
    .map(
      (card) => `
        <article class="insight-card">
          <span class="status-label">${escapeHtml(card.title)}</span>
          <strong class="${card.tone}">${escapeHtml(card.value)}</strong>
          <p>${escapeHtml(card.detail)}</p>
        </article>
      `
    )
    .join("");
}

function updateOverview() {
  const latestSnapshot = state.snapshots[state.snapshots.length - 1];
  const totalPlayers = latestSnapshot ? latestSnapshot.totalPlayers : 0;
  const activeServers = latestSnapshot ? latestSnapshot.activeServers : 0;
  const currentIssg = latestSnapshot ? latestSnapshot.issg : 0;

  elements.totalPlayers.textContent = formatNumber(totalPlayers);
  elements.activeServers.textContent = formatNumber(activeServers);
  elements.trackedServers.textContent = formatNumber(state.servers.length);
  elements.issgValue.textContent = formatNumber(currentIssg);

  const snapshotRange = filterByRange(state.snapshots, state.selectedRange);
  const playersDelta = getRangeDelta(snapshotRange, state.selectedRange, (item) => item.totalPlayers);
  const activeDelta = getRangeDelta(snapshotRange, state.selectedRange, (item) => item.activeServers);
  const issgDelta = getRangeDelta(snapshotRange, state.selectedRange, (item) => item.issg);
  const baselineIndex = getBaselineIndexForRange(snapshotRange, state.selectedRange);
  const baselineIssg = baselineIndex >= 0 ? Number(snapshotRange[baselineIndex]?.issg || 0) : currentIssg;
  const issgPercent = baselineIssg === 0 ? 0 : (issgDelta / baselineIssg) * 100;

  elements.playerDelta.textContent = formatDelta(playersDelta);
  elements.playerDelta.className = getDeltaClass(playersDelta);
  elements.serverDelta.textContent = formatDelta(activeDelta);
  elements.serverDelta.className = getDeltaClass(activeDelta);
  elements.issgDelta.textContent = `${formatDelta(issgDelta)} | ${formatPercent(issgPercent)}`;
  elements.issgDelta.className = getDeltaClass(issgDelta);

  const latestTimestamp = state.rows.reduce((max, row) => Math.max(max, row.timestamp), 0);
  if (elements.snapshotTime) {
    elements.snapshotTime.textContent = formatSnapshotTimestamp(latestTimestamp);
  }
  if (elements.rowCount) {
    elements.rowCount.textContent = formatNumber(state.rows.length);
  }
}

function renderTimeframeButtons() {
  elements.timeframeControls.innerHTML = RANGE_OPTIONS.map((option) => {
    const activeClass = option.key === state.selectedRange ? " is-active" : "";
    return `
      <button class="action-button timeframe-button${activeClass}" type="button" data-range="${option.key}">
        ${option.label}
      </button>
    `;
  }).join("");
  updateDeltaHeader();
}

function updateServerOptions() {
  const previousSelection = state.selectedServerId;
  const query = state.chartSearchQuery.trim().toLowerCase();
  const seriesOptions = getChartSeriesOptions();
  const visibleOptions = query
    ? seriesOptions.filter((option) => option.searchText.includes(query))
    : seriesOptions;

  elements.serverSelect.innerHTML = "";

  if (!seriesOptions.length) {
    const option = document.createElement("option");
    option.textContent = "No series available";
    option.value = "";
    elements.serverSelect.appendChild(option);
    state.selectedServerId = null;
    return null;
  }

  if (!visibleOptions.length) {
    const option = document.createElement("option");
    option.textContent = "No matching series";
    option.value = "";
    elements.serverSelect.appendChild(option);
  } else {
    visibleOptions.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.text;
      elements.serverSelect.appendChild(option);
    });
  }

  if (previousSelection && seriesOptions.some((option) => option.value === previousSelection)) {
    state.selectedServerId = previousSelection;
  } else {
    state.selectedServerId = state.servers[0]?.id || (state.snapshots.length ? ISSG_ID : null);
  }

  if (visibleOptions.some((option) => option.value === state.selectedServerId)) {
    elements.serverSelect.value = state.selectedServerId || "";
  } else if (visibleOptions[0]) {
    elements.serverSelect.value = visibleOptions[0].value;
  } else {
    elements.serverSelect.value = "";
  }

  state.selectedServerId = elements.serverSelect.value || null;
  return state.selectedServerId;
}

function renderTable() {
  const totalPages = Math.max(1, Math.ceil(state.filteredLeaderboardRows.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  state.page = Math.max(1, state.page);

  const startIndex = (state.page - 1) * PAGE_SIZE;
  const pageRows = state.filteredLeaderboardRows.slice(startIndex, startIndex + PAGE_SIZE);

  if (!pageRows.length) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">No servers match the current filter.</td>
      </tr>
    `;
  } else {
    elements.tableBody.innerHTML = pageRows
      .map((server, index) => {
        const rank = startIndex + index + 1;
        if (state.leaderboardMode === "tracked") {
          const avgClass = getTrackedAvgClass(server, pageRows);
          return `
          <tr>
            <td>${rank}</td>
            <td class="server-name">
              <div class="server-primary">${escapeHtml(getServerDisplayName(server))}</div>
              ${
                getServerSubtitle(server)
                  ? `<div class="server-secondary">${escapeHtml(getServerSubtitle(server))}</div>`
                  : ""
              }
            </td>
            <td>${formatNumber(server.peakPlayers)}</td>
            <td>${formatNumber(server.monthlyCapacity)}</td>
            <td><span class="${avgClass}">${formatNumber(Math.round(server.avgPlayers || 0))}</span></td>
          </tr>
        `;
        }
        const delta = getServerDeltaForRange(server, state.selectedRange);
        return `
          <tr>
            <td>${rank}</td>
            <td class="server-name">
              <div class="server-primary">${escapeHtml(getServerDisplayName(server))}</div>
              ${
                getServerSubtitle(server)
                  ? `<div class="server-secondary">${escapeHtml(getServerSubtitle(server))}</div>`
                  : ""
              }
            </td>
            <td>${formatNumber(server.latest.onlinePlayers)}</td>
            <td>${formatNumber(server.latest.maxplayers)}</td>
            <td><span class="${getDeltaClass(delta)}">${formatDelta(delta)}</span></td>
          </tr>
        `;
      })
      .join("");
  }

  elements.pageIndicator.textContent = `Page ${state.page} / ${totalPages}`;
  elements.prevPageButton.disabled = state.page <= 1;
  elements.nextPageButton.disabled = state.page >= totalPages;
}

function getSelectedSeries() {
  if (state.selectedServerId === ISSG_ID) {
    return {
      type: "issg",
      id: ISSG_ID,
      label: "ISSG",
      title: "ISSG Trend (Total Players Market)",
      context: "Total pemain gabungan seluruh server SA-MP.",
      items: filterByRange(state.snapshots, state.selectedRange),
      datasets: [
        {
          label: "Total Players (Market)",
          dataKey: "issg",
          color: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.16)",
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 2,
        },
      ],
      details: {
        identity: "ISSG (Total Players Gabungan)",
        gamemode: "N/A",
        map: "N/A",
        time: "N/A",
        weather: "N/A",
      },
    };
  }

  const server = state.servers.find((item) => item.id === state.selectedServerId);
  if (!server) {
    return null;
  }

  const timelineItems = buildServerTimeline(server, state.selectedRange);

  return {
    type: "server",
    id: server.id,
    label: getServerDisplayName(server),
    title: "Player + Weather Trend (Pemain + Cuaca)",
    context: `${getServerDisplayName(server)} | Rentang ${getRangeLabel(state.selectedRange)} | Zona waktu WIB`,
    items: filterByRange(server.entries, state.selectedRange),
    timelineItems,
    datasets: [
      {
        label: "Online Players (Pemain Online)",
        dataKey: "onlinePlayers",
        color: "#f59e0b",
        backgroundColor: "rgba(245, 158, 11, 0.18)",
        borderWidth: 2,
        fill: true,
        tension: 0.25,
        pointRadius: 2,
        yAxisID: "y",
        drivesScaleMax: true,
        spanGaps: false,
      },
      {
        label: "Capacity (Kapasitas)",
        dataKey: "maxplayers",
        color: "#475569",
        backgroundColor: "transparent",
        borderWidth: 1.5,
        fill: false,
        tension: 0,
        pointRadius: 0,
        borderDash: [6, 6],
        yAxisID: "y",
      },
      {
        label: "Weather (Cuaca)",
        dataKey: "weather",
        color: "#38bdf8",
        backgroundColor: "transparent",
        borderWidth: 2,
        fill: false,
        tension: 0,
        pointRadius: 2,
        borderDash: [3, 5],
        yAxisID: "weather",
        hidden: !server.entries.some((entry) => getWeatherCode(entry.weather) !== null),
        formatter: (value) => getWeatherCode(value),
        tooltipFormatter: (value) => formatWeather(value),
      },
      {
        label: "Availability (Online/Offline)",
        dataKey: "availability",
        color: "#a78bfa",
        backgroundColor: "transparent",
        borderWidth: 1.5,
        fill: false,
        tension: 0,
        pointRadius: 0,
        borderDash: [2, 4],
        yAxisID: "availability",
        stepped: true,
        formatter: (value) => (Number(value) ? 1 : 0),
        tooltipFormatter: (value) => (Number(value) ? "Online" : "Offline"),
      },
    ],
    details: {
      identity: server.hostname ? `${server.hostname} (${server.ip}:${server.port})` : server.id,
      gamemode: server.gamemode || "N/A",
      map: server.mapname || "N/A",
      time: formatServerTime(server.worldtime),
      weather: formatWeather(server.weather),
    },
  };
}

function renderChart() {
  const selectedSeries = getSelectedSeries();
  const canvas = document.getElementById("serverChart");

  if (!selectedSeries || !window.Chart) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (elements.chartTitle) {
      elements.chartTitle.textContent = "Player Trend (Pergerakan Pemain)";
    }
    if (elements.chartContext) {
      elements.chartContext.textContent = "WIB view with flexible time range.";
    }
    elements.serverIdentity.textContent = "-";
    elements.serverGamemode.textContent = "N/A";
    elements.serverMap.textContent = "N/A";
    elements.serverTime.textContent = "N/A";
    elements.serverWeather.textContent = "N/A";
    if (elements.trackingSince) {
      elements.trackingSince.textContent = "-";
    }
    return;
  }

  if (elements.chartTitle) {
    elements.chartTitle.textContent = selectedSeries.title;
  }
  if (elements.chartContext) {
    elements.chartContext.textContent =
      selectedSeries.type === "issg"
        ? `${selectedSeries.context} Rentang ${getRangeLabel(state.selectedRange)} | Zona waktu WIB`
        : selectedSeries.context;
  }
  elements.serverIdentity.textContent = selectedSeries.details.identity;
  elements.serverGamemode.textContent = selectedSeries.details.gamemode;
  elements.serverMap.textContent = selectedSeries.details.map;
  elements.serverTime.textContent = selectedSeries.details.time;
  elements.serverWeather.textContent = selectedSeries.details.weather;
  if (elements.trackingSince) {
    let trackingStart = 0;
    if (selectedSeries.type === "issg") {
      trackingStart = state.snapshots[0]?.timestamp || 0;
    } else {
      const server = state.servers.find((item) => item.id === selectedSeries.id);
      trackingStart = server?.entries?.[0]?.timestamp || selectedSeries.items[0]?.timestamp || 0;
    }
    elements.trackingSince.textContent = trackingStart ? formatSnapshotTimestamp(trackingStart) : "-";
  }

  const chartItems = selectedSeries.timelineItems || selectedSeries.items;
  const labels = chartItems.map((entry) => formatAxisTimestamp(entry.timestamp, state.selectedRange));
  const datasets = selectedSeries.datasets.map((dataset) => ({
    label: dataset.label,
    data: chartItems.map((entry) => {
      const value = entry[dataset.dataKey];
      if (dataset.formatter) {
        return dataset.formatter(value);
      }
      return dataset.dataKey === "issg" ? Number(value) : value;
    }),
    borderColor: dataset.color,
    backgroundColor: dataset.backgroundColor,
    borderWidth: dataset.borderWidth,
    fill: dataset.fill,
    tension: dataset.tension,
    pointRadius: dataset.pointRadius,
    borderDash: dataset.borderDash || [],
    yAxisID: dataset.yAxisID || "y",
    spanGaps: dataset.spanGaps ?? true,
    hidden: dataset.hidden || false,
    drivesScaleMax: dataset.drivesScaleMax || false,
    stepped: dataset.stepped || false,
  }));
  const hasWeatherDataset = datasets.some((dataset) => dataset.yAxisID === "weather" && !dataset.hidden);
  const primaryScale = getPrimaryScaleConfig(datasets);
  const weatherScale = getWeatherScaleConfig(chartItems, hasWeatherDataset);
  const hasAvailabilityDataset = datasets.some((dataset) => dataset.yAxisID === "availability" && !dataset.hidden);
  const availabilityScale = {
    display: hasAvailabilityDataset,
    position: "right",
    min: 0,
    max: 1,
    ticks: {
      color: "#94a3b8",
      stepSize: 1,
      callback(value) {
        return Number(value) >= 1 ? "ON" : "OFF";
      },
    },
    grid: {
      drawOnChartArea: false,
    },
  };

  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          onClick(event, legendItem, legend) {
            const chartInstance = legend.chart;
            const datasetIndex = legendItem.datasetIndex;
            const meta = chartInstance.getDatasetMeta(datasetIndex);

            meta.hidden = meta.hidden === null ? !chartInstance.data.datasets[datasetIndex].hidden : null;
            chartInstance.options.scales.y = getPrimaryScaleConfig(
              chartInstance.data.datasets,
              (index) => chartInstance.isDatasetVisible(index)
            );
            syncWeatherAxisVisibility(chartInstance);
            chartInstance.update();
          },
          labels: {
            color: "#cbd5e1",
            usePointStyle: true,
            boxWidth: 10,
          },
        },
        tooltip: {
          callbacks: {
            title(tooltipItems) {
              const item = chartItems[tooltipItems[0].dataIndex];
              return formatSnapshotTimestamp(item.timestamp);
            },
            label(tooltipItem) {
              const datasetConfig = selectedSeries.datasets[tooltipItem.datasetIndex];
              if (datasetConfig?.tooltipFormatter) {
                return `${datasetConfig.label}: ${datasetConfig.tooltipFormatter(
                  chartItems[tooltipItem.dataIndex][datasetConfig.dataKey]
                )}`;
              }
              return `${tooltipItem.dataset.label}: ${tooltipItem.formattedValue}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#94a3b8",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
          grid: {
            color: "rgba(148, 163, 184, 0.12)",
          },
        },
        y: {
          ...primaryScale,
        },
        weather: weatherScale,
        availability: availabilityScale,
      },
    },
  });

  syncWeatherAxisVisibility(state.chart);
  state.chart.update();
}

function applySearch() {
  const query = elements.searchInput.value.trim().toLowerCase();
  state.filteredLeaderboardRows = state.leaderboardRows.filter((server) => {
    const haystack = [
      server.id,
      getServerDisplayName(server),
      getServerSubtitle(server),
      server.gamemode,
      server.mapname,
      server.worldtime,
      formatWeather(server.weather),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
  state.page = 1;
  renderTable();
}

function renderAll() {
  state.snapshots = buildSnapshotState(state.rows);
  state.servers = buildServerState(state.rows);
  const monthlyLeaderboardState = buildMonthlyLeaderboardState(state.rows);
  state.availableLeaderboardMonths = monthlyLeaderboardState.months;
  state.monthlyLeaderboardByMonth = monthlyLeaderboardState.leaderboardByMonth;
  updateLeaderboardMonthOptions();
  updateLeaderboardRows();
  renderTimeframeButtons();
  updateLeaderboardControls();
  updateOverview();
  updateServerOptions();
  updateCompareOptions();
  applySearch();
  renderChart();
  renderInsights();
  renderCompare();
  updateDeltaHeader();
}

async function loadFromProjectCsv() {
  const response = await fetch(`${DATA_URL}?range=${encodeURIComponent(state.selectedRange)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const csvText = await response.text();
  state.lastProjectCsvText = csvText;
  state.rows = parseCsv(csvText);
  state.lastSource = "server API";
  if (elements.dataSource) {
    elements.dataSource.textContent = `API (${state.selectedRange})`;
  }
  setStatus("Data loaded successfully. Data berhasil dimuat.", "up");
  renderAll();
}

async function autoRefreshProjectCsv() {
  if (state.lastSource !== "server API") {
    return;
  }
  if (document.visibilityState && document.visibilityState !== "visible") {
    return;
  }

  try {
    const response = await fetch(`${DATA_URL}?range=${encodeURIComponent(state.selectedRange)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }
    const csvText = await response.text();
    if (state.lastProjectCsvText === csvText) {
      return;
    }

    state.lastProjectCsvText = csvText;
    state.rows = parseCsv(csvText);
    state.lastSource = "server API";
    if (elements.dataSource) {
      elements.dataSource.textContent = `API (${state.selectedRange})`;
    }
    renderAll();
  } catch {
    // Silent: auto-refresh should never block the UI.
  }
}

function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      setLoading(true, "Loading CSV…");
      state.rows = parseCsv(String(reader.result || ""));
      state.lastSource = "manual file";
      state.lastProjectCsvText = null;
      if (elements.dataSource) {
        elements.dataSource.textContent = file.name;
      }
      setStatus("CSV loaded from file picker. File lokal berhasil dimuat.", "up");
      renderAll();
    } catch (error) {
      setStatus(error.message, "down");
    } finally {
      setLoading(false);
    }
  };
  reader.onerror = () => {
    setStatus("Failed to read the selected CSV file.", "down");
  };
  reader.readAsText(file);
}

async function refreshData() {
  setLoading(true, "Refreshing data…");
  setStatus("Refreshing data... Menyegarkan data...", "neutral");
  try {
    await loadFromProjectCsv();
  } catch (error) {
    setStatus(
      "Auto-load failed. Jika index.html dibuka langsung, gunakan Load CSV atau jalankan local server.",
      "down"
    );
  } finally {
    setLoading(false);
  }
}

elements.refreshButton.addEventListener("click", refreshData);
elements.filePicker.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  if (file) {
    loadFromFile(file);
  }
});
elements.serverSelect.addEventListener("change", (event) => {
  state.selectedServerId = event.target.value;
  renderChart();
  renderInsights();
});
elements.serverSearchInput.addEventListener("input", (event) => {
  state.chartSearchQuery = event.target.value;
  updateServerOptions();
  renderChart();
  renderInsights();
});
if (elements.compareSelectA) {
  elements.compareSelectA.addEventListener("change", (event) => {
    state.compareServerAId = event.target.value || null;
    renderCompare();
  });
}
if (elements.compareSelectB) {
  elements.compareSelectB.addEventListener("change", (event) => {
    state.compareServerBId = event.target.value || null;
    renderCompare();
  });
}
if (elements.compareSearchInputA) {
  elements.compareSearchInputA.addEventListener("input", (event) => {
    state.compareSearchQueryA = event.target.value;
    updateCompareOptions();
    renderCompare();
  });
}
if (elements.compareSearchInputB) {
  elements.compareSearchInputB.addEventListener("input", (event) => {
    state.compareSearchQueryB = event.target.value;
    updateCompareOptions();
    renderCompare();
  });
}
elements.timeframeControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) {
    return;
  }

  const nextRange = button.dataset.range;
  if (nextRange === state.selectedRange) {
    return;
  }

  state.selectedRange = nextRange;
  renderTimeframeButtons();
  refreshData();
});
elements.searchInput.addEventListener("input", applySearch);
if (elements.leaderboardMode) {
  elements.leaderboardMode.addEventListener("change", (event) => {
    state.leaderboardMode = event.target.value === "tracked" ? "tracked" : "realtime";
    state.page = 1;
    updateLeaderboardRows();
    updateLeaderboardControls();
    applySearch();
  });
}
if (elements.leaderboardMonth) {
  elements.leaderboardMonth.addEventListener("change", (event) => {
    state.selectedLeaderboardMonth = event.target.value;
    state.page = 1;
    updateLeaderboardRows();
    updateLeaderboardControls();
    applySearch();
  });
}
elements.prevPageButton.addEventListener("click", () => {
  state.page -= 1;
  renderTable();
});
elements.nextPageButton.addEventListener("click", () => {
  state.page += 1;
  renderTable();
});

refreshData();

// Auto refresh (server API only). Works when the dashboard is served over HTTP.
setInterval(autoRefreshProjectCsv, 60 * 1000);
