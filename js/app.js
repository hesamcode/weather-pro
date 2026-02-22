const STORAGE_KEY = "weather-pro:store";
const STORAGE_VERSION = 3;
const AUTOCOMPLETE_MIN = 2;
const AUTOCOMPLETE_LIMIT = 8;
const AUTOCOMPLETE_DELAY = 240;
const REQUEST_TIMEOUT_MS = 14000;
const MAX_FAVORITES = 12;
const MAX_RECENT = 8;
const DEGREE = String.fromCharCode(176);

const WEATHER_LABELS = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Severe storm with hail"
};

const state = {
  storageAvailable: true,
  settings: {
    theme: "light",
    unit: "celsius"
  },
  favorites: [],
  recent: [],
  activeCity: null,
  lastWeatherPayload: null,
  lastErrorCity: null,
  autocomplete: [],
  activeAutocompleteIndex: -1,
  autocompleteDebounce: null,
  searchController: null,
  weatherController: null,
  autocompleteToken: 0,
  weatherToken: 0,
  chart: null,
  chartUnavailableNotified: false,
  aboutReturnFocus: null
};

const refs = {
  themeToggle: document.getElementById("themeToggle"),
  unitC: document.getElementById("unitC"),
  unitF: document.getElementById("unitF"),
  aboutOpenBtn: document.getElementById("aboutOpenBtn"),
  aboutModal: document.getElementById("aboutModal"),
  aboutDialog: document.getElementById("aboutDialog"),
  aboutCloseBtn: document.getElementById("aboutCloseBtn"),
  aboutBackdrop: document.querySelector("[data-close-about]"),
  searchForm: document.getElementById("searchForm"),
  cityInput: document.getElementById("cityInput"),
  autocompleteList: document.getElementById("autocompleteList"),
  statusText: document.getElementById("statusText"),
  loadingState: document.getElementById("loadingState"),
  errorState: document.getElementById("errorState"),
  errorMessage: document.getElementById("errorMessage"),
  retryBtn: document.getElementById("retryBtn"),
  weatherContent: document.getElementById("weatherContent"),
  favoriteToggle: document.getElementById("favoriteToggle"),
  locationLine: document.getElementById("locationLine"),
  currentTemp: document.getElementById("currentTemp"),
  currentLabel: document.getElementById("currentLabel"),
  feelsLike: document.getElementById("feelsLike"),
  humidity: document.getElementById("humidity"),
  wind: document.getElementById("wind"),
  precipitation: document.getElementById("precipitation"),
  lastUpdated: document.getElementById("lastUpdated"),
  forecastList: document.getElementById("forecastList"),
  favoritesList: document.getElementById("favoritesList"),
  recentList: document.getElementById("recentList"),
  hourlyChart: document.getElementById("hourlyChart"),
  chartMessage: document.getElementById("chartMessage"),
  toastRegion: document.getElementById("toastRegion")
};

init();

function init() {
  state.storageAvailable = canUseStorage();

  const stored = loadStorage();
  state.settings = stored.settings;
  state.favorites = stored.favorites;
  state.recent = stored.recent;

  applyTheme(state.settings.theme);
  syncUnitButtons();
  renderFavorites();
  renderRecent();
  updateFavoriteButton();

  bindEvents();
  setStatus("Search a city to load weather details.");

  if (!state.storageAvailable) {
    showToast("Local storage unavailable. Persistence is disabled.", "error", 4200);
  }

  if (!navigator.onLine) {
    setStatus("You are offline. Results may be unavailable.");
  }

  if (state.recent.length > 0) {
    void fetchWeatherForCity(state.recent[0], { skipRecent: true, silent: true });
  }
}

function bindEvents() {
  refs.themeToggle.addEventListener("click", onThemeToggle);
  refs.unitC.addEventListener("click", () => onUnitChange("celsius"));
  refs.unitF.addEventListener("click", () => onUnitChange("fahrenheit"));

  refs.searchForm.addEventListener("submit", (event) => {
    void onSearchSubmit(event);
  });

  refs.cityInput.addEventListener("input", onCityInput);
  refs.cityInput.addEventListener("keydown", onCityInputKeydown);
  refs.cityInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      hideAutocomplete();
    }, 120);
  });

  refs.retryBtn.addEventListener("click", () => {
    void onRetry();
  });

  refs.favoriteToggle.addEventListener("click", onFavoriteToggle);

  refs.favoritesList.addEventListener("click", onSavedListClick);
  refs.recentList.addEventListener("click", onSavedListClick);

  refs.aboutOpenBtn.addEventListener("click", openAboutModal);
  refs.aboutCloseBtn.addEventListener("click", closeAboutModal);
  refs.aboutBackdrop.addEventListener("click", closeAboutModal);

  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    if (reason && reason.name === "AbortError") {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    showToast("Unexpected error happened. Please retry.", "error");
  });
}

function onThemeToggle() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  applyTheme(state.settings.theme);
  persistStorage();

  if (state.lastWeatherPayload) {
    renderChart(state.lastWeatherPayload.hourly, state.lastWeatherPayload.current.time);
  }
}

function onUnitChange(unit) {
  if (state.settings.unit === unit) {
    return;
  }

  state.settings.unit = unit;
  syncUnitButtons();
  persistStorage();

  if (state.activeCity) {
    void fetchWeatherForCity(state.activeCity, { skipRecent: true });
  }
}

async function onSearchSubmit(event) {
  event.preventDefault();

  const query = refs.cityInput.value.trim();
  if (!query) {
    setStatus("Enter a city name.");
    return;
  }

  if (state.activeAutocompleteIndex >= 0 && state.autocomplete[state.activeAutocompleteIndex]) {
    selectAutocomplete(state.autocomplete[state.activeAutocompleteIndex]);
    return;
  }

  hideAutocomplete();
  setStatus("Finding city...");

  let city = await lookupCity(query);

  if (!city) {
    city = findInLocalLists(query);
  }

  if (!city) {
    setStatus("No matching city found.");
    showToast("No city match found.", "error");
    return;
  }

  refs.cityInput.value = formatCityDisplay(city);
  await fetchWeatherForCity(city);
}

function onCityInput(event) {
  const query = event.target.value.trim();

  if (state.autocompleteDebounce) {
    window.clearTimeout(state.autocompleteDebounce);
  }

  if (query.length < AUTOCOMPLETE_MIN) {
    hideAutocomplete();
    return;
  }

  state.autocompleteDebounce = window.setTimeout(() => {
    void loadAutocomplete(query);
  }, AUTOCOMPLETE_DELAY);
}

function onCityInputKeydown(event) {
  if (refs.autocompleteList.hidden || state.autocomplete.length === 0) {
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.activeAutocompleteIndex = (state.activeAutocompleteIndex + 1) % state.autocomplete.length;
    syncAutocompleteSelection();
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    state.activeAutocompleteIndex =
      (state.activeAutocompleteIndex - 1 + state.autocomplete.length) % state.autocomplete.length;
    syncAutocompleteSelection();
    return;
  }

  if (event.key === "Escape") {
    hideAutocomplete();
    return;
  }

  if (event.key === "Enter" && state.activeAutocompleteIndex >= 0) {
    event.preventDefault();
    selectAutocomplete(state.autocomplete[state.activeAutocompleteIndex]);
  }
}

async function onRetry() {
  if (!state.lastErrorCity) {
    setStatus("Search for a city first.");
    return;
  }

  await fetchWeatherForCity(state.lastErrorCity, { skipRecent: true });
}

function onFavoriteToggle() {
  if (!state.activeCity) {
    return;
  }

  const city = state.activeCity;
  const index = state.favorites.findIndex((item) => item.id === city.id);

  if (index >= 0) {
    state.favorites.splice(index, 1);
    showToast(city.name + " removed from favorites.", "success");
  } else {
    state.favorites.unshift(city);
    state.favorites = dedupeLocations(state.favorites).slice(0, MAX_FAVORITES);
    showToast(city.name + " added to favorites.", "success");
  }

  persistStorage();
  renderFavorites();
  updateFavoriteButton();
}

function onSavedListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.action;
  const list = button.dataset.list;
  const cityId = button.dataset.cityId;
  const source = list === "favorites" ? state.favorites : state.recent;
  const city = source.find((item) => item.id === cityId);

  if (!city) {
    return;
  }

  if (action === "open") {
    refs.cityInput.value = formatCityDisplay(city);
    void fetchWeatherForCity(city, { skipRecent: list === "recent" });
    return;
  }

  if (action === "remove") {
    if (list === "favorites") {
      state.favorites = state.favorites.filter((item) => item.id !== cityId);
      renderFavorites();
      updateFavoriteButton();
      showToast(city.name + " removed from favorites.", "success");
    } else {
      state.recent = state.recent.filter((item) => item.id !== cityId);
      renderRecent();
      showToast(city.name + " removed from recent searches.", "success");
    }

    persistStorage();
  }
}

function onOnline() {
  showToast("Back online.", "success");
  setStatus("Back online. Search for a city.");
}

function onOffline() {
  showToast("You are offline.", "error");
  setStatus("Offline mode: network requests are unavailable.");
}

function onGlobalKeydown(event) {
  if (event.key === "Escape" && !refs.aboutModal.hidden) {
    closeAboutModal();
    return;
  }

  if (event.key === "Tab" && !refs.aboutModal.hidden) {
    trapModalFocus(event);
  }
}

function openAboutModal() {
  state.aboutReturnFocus = document.activeElement;
  refs.aboutModal.hidden = false;
  refs.aboutDialog.focus();
}

function closeAboutModal() {
  refs.aboutModal.hidden = true;

  if (state.aboutReturnFocus && typeof state.aboutReturnFocus.focus === "function") {
    state.aboutReturnFocus.focus();
  }
}

function trapModalFocus(event) {
  const focusable = refs.aboutDialog.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');

  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function loadAutocomplete(query) {
  const token = ++state.autocompleteToken;

  if (state.searchController) {
    state.searchController.abort();
  }

  const controller = new AbortController();
  state.searchController = controller;

  refs.cityInput.setAttribute("aria-busy", "true");
  renderAutocompleteHint("Searching...");

  try {
    const results = await fetchGeocoding(query, AUTOCOMPLETE_LIMIT, controller.signal);

    if (token !== state.autocompleteToken) {
      return;
    }

    if (results.length === 0) {
      state.autocomplete = [];
      state.activeAutocompleteIndex = -1;
      renderAutocompleteHint("No city found.");
      return;
    }

    state.autocomplete = results;
    state.activeAutocompleteIndex = -1;
    renderAutocompleteList();
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    if (token !== state.autocompleteToken) {
      return;
    }

    state.autocomplete = [];
    state.activeAutocompleteIndex = -1;
    renderAutocompleteHint("Suggestions unavailable.");
  } finally {
    if (token === state.autocompleteToken) {
      refs.cityInput.setAttribute("aria-busy", "false");
    }
  }
}

function renderAutocompleteHint(text) {
  refs.autocompleteList.innerHTML = "";

  const li = document.createElement("li");
  li.className = "autocomplete-hint";
  li.textContent = text;

  refs.autocompleteList.appendChild(li);
  refs.autocompleteList.hidden = false;
  refs.cityInput.setAttribute("aria-expanded", "true");
  refs.cityInput.setAttribute("aria-activedescendant", "");
}

function renderAutocompleteList() {
  refs.autocompleteList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.autocomplete.forEach((city, index) => {
    const li = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "autocomplete-item";
    button.id = "ac-option-" + index;
    button.role = "option";
    button.setAttribute("aria-selected", "false");

    const name = document.createElement("span");
    name.className = "ac-name";
    name.textContent = city.name;

    const meta = document.createElement("span");
    meta.className = "ac-meta";
    meta.textContent = [city.admin1, city.country].filter(Boolean).join(", ") || "Unknown";

    button.append(name, meta);

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      selectAutocomplete(city);
    });

    li.appendChild(button);
    fragment.appendChild(li);
  });

  refs.autocompleteList.appendChild(fragment);
  refs.autocompleteList.hidden = false;
  refs.cityInput.setAttribute("aria-expanded", "true");
  syncAutocompleteSelection();
}

function syncAutocompleteSelection() {
  const options = refs.autocompleteList.querySelectorAll(".autocomplete-item");

  options.forEach((option, index) => {
    const active = index === state.activeAutocompleteIndex;
    option.classList.toggle("active", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (state.activeAutocompleteIndex >= 0) {
    refs.cityInput.setAttribute("aria-activedescendant", "ac-option-" + state.activeAutocompleteIndex);
  } else {
    refs.cityInput.setAttribute("aria-activedescendant", "");
  }
}

function hideAutocomplete() {
  state.autocomplete = [];
  state.activeAutocompleteIndex = -1;
  refs.autocompleteList.innerHTML = "";
  refs.autocompleteList.hidden = true;
  refs.cityInput.setAttribute("aria-expanded", "false");
  refs.cityInput.setAttribute("aria-activedescendant", "");
  refs.cityInput.setAttribute("aria-busy", "false");
}

function selectAutocomplete(city) {
  if (!city) {
    return;
  }

  refs.cityInput.value = formatCityDisplay(city);
  hideAutocomplete();
  void fetchWeatherForCity(city);
}

async function lookupCity(query) {
  if (state.searchController) {
    state.searchController.abort();
  }

  const controller = new AbortController();
  state.searchController = controller;

  try {
    const results = await fetchGeocoding(query, 1, controller.signal);
    return results[0] || null;
  } catch (error) {
    if (error.name === "AbortError") {
      return null;
    }

    showToast("City lookup failed.", "error");
    return null;
  }
}

async function fetchWeatherForCity(city, options) {
  if (!city) {
    return;
  }

  const opts = options || {};
  const skipRecent = Boolean(opts.skipRecent);
  const silent = Boolean(opts.silent);

  const token = ++state.weatherToken;

  if (state.weatherController) {
    state.weatherController.abort();
  }

  const controller = new AbortController();
  state.weatherController = controller;

  state.activeCity = city;
  state.lastErrorCity = city;

  showError(false);
  showLoading(true);
  showContent(false);

  if (!silent) {
    setStatus("Loading weather for " + city.name + "...");
  }

  const query = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    timezone: "auto",
    forecast_days: "7",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation,is_day",
    hourly: "time,temperature_2m",
    daily: "time,weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: state.settings.unit,
    wind_speed_unit: "kmh"
  });

  const url = "https://api.open-meteo.com/v1/forecast?" + query.toString();

  try {
    const payload = await fetchJson(url, controller.signal, REQUEST_TIMEOUT_MS);

    if (token !== state.weatherToken) {
      return;
    }

    validateWeatherPayload(payload);

    state.lastWeatherPayload = payload;

    renderCurrent(city, payload.current);
    renderForecast(payload.daily);
    renderChart(payload.hourly, payload.current.time);
    applyAtmosphere(payload.current.weather_code, payload.current.is_day);

    if (!skipRecent) {
      addRecent(city);
    }

    updateFavoriteButton();
    showLoading(false);
    showContent(true);
    setStatus("Showing weather for " + formatCityDisplay(city) + ".");
  } catch (error) {
    if (token !== state.weatherToken) {
      return;
    }

    if (error.name === "AbortError") {
      return;
    }

    showLoading(false);
    showContent(false);
    showError(true, readableError(error));
    setStatus("Unable to load weather right now.");
    showToast("Could not load weather data.", "error");
  }
}

function renderCurrent(city, current) {
  refs.locationLine.textContent = formatCityDisplay(city);

  const label = WEATHER_LABELS[current.weather_code] || "Unknown";
  const phase = current.is_day === 1 ? "Day" : "Night";

  refs.currentTemp.textContent = formatTemp(current.temperature_2m);
  refs.currentLabel.textContent = label + " (" + phase + ")";
  refs.feelsLike.textContent = formatTemp(current.apparent_temperature);
  refs.humidity.textContent = safeNumber(current.relative_humidity_2m) + "%";
  refs.wind.textContent = safeNumber(current.wind_speed_10m) + " km/h";
  refs.precipitation.textContent = safeNumber(current.precipitation) + " mm";
  refs.lastUpdated.textContent = "Updated: " + formatDateTime(current.time);
}

function renderForecast(daily) {
  refs.forecastList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < daily.time.length; i += 1) {
    const code = daily.weather_code[i];
    const card = document.createElement("li");
    card.className = "forecast-card";

    const day = document.createElement("span");
    day.className = "forecast-day";
    day.textContent = i === 0 ? "Today" : formatDay(daily.time[i]);

    const desc = document.createElement("span");
    desc.className = "forecast-text";
    desc.textContent =
      (WEATHER_LABELS[code] || "Unknown") + " | Rain " + safeNumber(daily.precipitation_probability_max[i]) + "%";

    const temp = document.createElement("div");
    temp.className = "forecast-temp";

    const high = document.createElement("span");
    high.className = "forecast-high";
    high.textContent = formatTemp(daily.temperature_2m_max[i]);

    const low = document.createElement("span");
    low.className = "forecast-low";
    low.textContent = formatTemp(daily.temperature_2m_min[i]);

    temp.append(high, low);
    card.append(day, desc, temp);
    fragment.appendChild(card);
  }

  refs.forecastList.appendChild(fragment);
}

function renderChart(hourly, currentTime) {
  if (!window.Chart) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    refs.chartMessage.textContent = "Chart unavailable because Chart.js could not load.";
    refs.chartMessage.hidden = false;

    if (!state.chartUnavailableNotified) {
      showToast("Chart library unavailable.", "error");
      state.chartUnavailableNotified = true;
    }

    return;
  }

  const points = getNext24Hours(hourly.time, hourly.temperature_2m, currentTime);

  if (points.length === 0) {
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }

    refs.chartMessage.textContent = "No hourly data available for this city.";
    refs.chartMessage.hidden = false;
    return;
  }

  refs.chartMessage.hidden = true;
  state.chartUnavailableNotified = false;

  const labels = points.map((p) => p.label);
  const values = points.map((p) => p.value);

  if (state.chart) {
    state.chart.destroy();
  }

  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue("--primary").trim() || "#1b6ef3";
  const textColor = styles.getPropertyValue("--text").trim() || "#10203c";
  const lineGrid = styles.getPropertyValue("--line").trim() || "rgba(17, 32, 67, 0.14)";

  const ctx = refs.hourlyChart.getContext("2d");
  if (!ctx) {
    refs.chartMessage.textContent = "Chart rendering unavailable in this browser.";
    refs.chartMessage.hidden = false;
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, "rgba(27, 110, 243, 0.38)");
  gradient.addColorStop(1, "rgba(27, 110, 243, 0.03)");

  state.chart = new window.Chart(refs.hourlyChart, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          data: values,
          borderColor: lineColor,
          borderWidth: 2.7,
          backgroundColor: gradient,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHitRadius: 16,
          tension: 0.28
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(20, 28, 44, 0.95)",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 9,
          callbacks: {
            label: (context) => {
              return " " + context.parsed.y + DEGREE + (state.settings.unit === "celsius" ? "C" : "F");
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: lineGrid
          },
          ticks: {
            color: textColor,
            maxRotation: 0,
            autoSkip: false,
            callback: (value, index) => {
              return index % 3 === 0 ? labels[index] : "";
            }
          }
        },
        y: {
          grid: {
            color: lineGrid
          },
          ticks: {
            color: textColor,
            callback: (value) => String(value) + DEGREE
          }
        }
      }
    }
  });
}

function getNext24Hours(times, temps, currentTime) {
  if (!Array.isArray(times) || !Array.isArray(temps) || times.length === 0 || temps.length === 0) {
    return [];
  }

  const start = indexFromTime(times, currentTime);
  const segmentTimes = times.slice(start, start + 24);
  const segmentTemps = temps.slice(start, start + 24);

  return segmentTimes
    .map((time, index) => {
      return {
        label: formatHour(time),
        value: safeNumber(segmentTemps[index])
      };
    })
    .filter((point) => point.label !== "--");
}

function indexFromTime(times, currentTime) {
  const ref = Date.parse(currentTime);
  if (Number.isNaN(ref)) {
    return 0;
  }

  const index = times.findIndex((time) => Date.parse(time) >= ref);
  return index >= 0 ? index : 0;
}

function applyAtmosphere(code, isDay) {
  let atmosphere = "cloud";

  if (isDay === 0) {
    atmosphere = "night";
  }

  if ([95, 96, 99].indexOf(code) >= 0) {
    atmosphere = "storm";
  } else if ([71, 73, 75, 77, 85, 86].indexOf(code) >= 0) {
    atmosphere = "snow";
  } else if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].indexOf(code) >= 0) {
    atmosphere = "rain";
  } else if (isDay === 1 && [0, 1].indexOf(code) >= 0) {
    atmosphere = "clear-day";
  }

  document.body.setAttribute("data-atmosphere", atmosphere);
}

function addRecent(city) {
  state.recent = [city].concat(state.recent.filter((item) => item.id !== city.id)).slice(0, MAX_RECENT);
  persistStorage();
  renderRecent();
}

function renderFavorites() {
  renderSavedList(refs.favoritesList, state.favorites, "favorites", "No favorites yet.");
}

function renderRecent() {
  renderSavedList(refs.recentList, state.recent, "recent", "No recent searches yet.");
}

function renderSavedList(target, items, listName, emptyMessage) {
  target.innerHTML = "";

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-note";
    li.textContent = emptyMessage;
    target.appendChild(li);
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((city) => {
    const row = document.createElement("li");
    row.className = "saved-row";

    const left = document.createElement("div");

    const open = document.createElement("button");
    open.type = "button";
    open.className = "saved-open";
    open.dataset.action = "open";
    open.dataset.list = listName;
    open.dataset.cityId = city.id;
    open.textContent = city.name;

    const meta = document.createElement("span");
    meta.className = "saved-meta";
    meta.textContent = [city.admin1, city.country].filter(Boolean).join(", ") || "-";

    left.append(open, meta);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "saved-remove";
    remove.dataset.action = "remove";
    remove.dataset.list = listName;
    remove.dataset.cityId = city.id;
    remove.setAttribute("aria-label", "Remove " + city.name);
    remove.textContent = "Remove";

    row.append(left, remove);
    fragment.appendChild(row);
  });

  target.appendChild(fragment);
}

function updateFavoriteButton() {
  if (!state.activeCity) {
    refs.favoriteToggle.textContent = "Add favorite";
    refs.favoriteToggle.setAttribute("aria-pressed", "false");
    return;
  }

  const exists = state.favorites.some((city) => city.id === state.activeCity.id);
  refs.favoriteToggle.textContent = exists ? "Remove favorite" : "Add favorite";
  refs.favoriteToggle.setAttribute("aria-pressed", exists ? "true" : "false");
}

function applyTheme(theme) {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", normalized);
  document.documentElement.style.colorScheme = normalized;

  const dark = normalized === "dark";
  refs.themeToggle.textContent = "Theme: " + (dark ? "Dark" : "Light");
  refs.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
}

function syncUnitButtons() {
  const celsius = state.settings.unit === "celsius";
  refs.unitC.setAttribute("aria-pressed", celsius ? "true" : "false");
  refs.unitF.setAttribute("aria-pressed", celsius ? "false" : "true");
}

function showLoading(show) {
  refs.loadingState.hidden = !show;
  refs.loadingState.setAttribute("aria-hidden", show ? "false" : "true");
}

function showError(show, message) {
  refs.errorState.hidden = !show;
  if (show) {
    refs.errorMessage.textContent = message || "Please try again shortly.";
  }
}

function showContent(show) {
  refs.weatherContent.hidden = !show;
}

function setStatus(text) {
  refs.statusText.textContent = text;
}

function showToast(message, type, duration) {
  const tone = type || "info";
  const life = duration || 3000;

  while (refs.toastRegion.children.length >= 4) {
    refs.toastRegion.firstElementChild.remove();
  }

  const toast = document.createElement("div");
  toast.className = "toast " + tone;
  toast.setAttribute("role", "status");
  toast.textContent = message;

  refs.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, life);
}

function formatCityDisplay(city) {
  return [city.name, city.admin1, city.country].filter(Boolean).join(", ");
}

function formatTemp(value) {
  const rounded = Math.round(safeNumber(value));
  const suffix = state.settings.unit === "celsius" ? "C" : "F";
  return String(rounded) + DEGREE + suffix;
}

function formatDay(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatHour(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric"
  }).format(date);
}

function formatDateTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

async function fetchGeocoding(query, count, signal) {
  const params = new URLSearchParams({
    name: query,
    count: String(count),
    language: "en",
    format: "json"
  });

  const url = "https://geocoding-api.open-meteo.com/v1/search?" + params.toString();
  const payload = await fetchJson(url, signal, REQUEST_TIMEOUT_MS);

  if (!payload || !Array.isArray(payload.results)) {
    return [];
  }

  return dedupeLocations(
    payload.results
      .map(normalizeLocation)
      .filter((location) => location !== null)
      .slice(0, count)
  );
}

async function fetchJson(url, signal, timeoutMs) {
  const timeoutController = new AbortController();
  const timeout = window.setTimeout(() => {
    timeoutController.abort();
  }, timeoutMs || REQUEST_TIMEOUT_MS);

  const linked = linkSignals([signal, timeoutController.signal]);

  let response;

  try {
    response = await fetch(url, {
      signal: linked.signal,
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    if (timeoutController.signal.aborted && !(signal && signal.aborted)) {
      throw new Error("Request timed out.");
    }

    if (error.name === "AbortError") {
      throw error;
    }

    throw new Error("Network request failed.");
  } finally {
    window.clearTimeout(timeout);
    linked.cleanup();
  }

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  try {
    return await response.json();
  } catch (_error) {
    throw new Error("Invalid server response.");
  }
}

function linkSignals(signals) {
  const controller = new AbortController();
  const cleanups = [];

  const onAbort = () => {
    controller.abort();
  };

  signals
    .filter(Boolean)
    .forEach((source) => {
      if (source.aborted) {
        controller.abort();
        return;
      }

      source.addEventListener("abort", onAbort, { once: true });
      cleanups.push(() => {
        source.removeEventListener("abort", onAbort);
      });
    });

  return {
    signal: controller.signal,
    cleanup: () => {
      cleanups.forEach((fn) => fn());
    }
  };
}

function validateWeatherPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing weather payload.");
  }

  if (!payload.current || !payload.hourly || !payload.daily) {
    throw new Error("Incomplete weather payload.");
  }

  const daily = payload.daily;
  const hourly = payload.hourly;

  const requiredDaily = [
    "time",
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max"
  ];

  const requiredHourly = ["time", "temperature_2m"];

  const dayLength = Array.isArray(daily.time) ? daily.time.length : 0;
  if (dayLength < 7) {
    throw new Error("Daily forecast too short.");
  }

  requiredDaily.forEach((key) => {
    if (!Array.isArray(daily[key]) || daily[key].length !== dayLength) {
      throw new Error("Incomplete daily forecast data.");
    }
  });

  requiredHourly.forEach((key) => {
    if (!Array.isArray(hourly[key]) || hourly[key].length === 0) {
      throw new Error("Incomplete hourly data.");
    }
  });

  const current = payload.current;
  if (typeof current.temperature_2m !== "number" || typeof current.weather_code !== "number") {
    throw new Error("Incomplete current weather data.");
  }
}

function readableError(error) {
  const message = error && error.message ? error.message : "Unknown error";

  if (message.indexOf("HTTP") === 0) {
    return "Weather service returned an error. Please retry shortly.";
  }

  if (message.indexOf("Request timed out") >= 0) {
    return "Weather request timed out. Please retry.";
  }

  if (message.indexOf("Network request failed") >= 0) {
    return "Network request failed. Check your connection.";
  }

  if (message.indexOf("Invalid server response") >= 0) {
    return "Weather service response was invalid.";
  }

  return "Could not load weather right now. Please try again.";
}

function canUseStorage() {
  try {
    const probe = "__weather_pro_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch (_error) {
    return false;
  }
}

function loadStorage() {
  const defaults = {
    version: STORAGE_VERSION,
    settings: {
      theme: window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      unit: "celsius"
    },
    favorites: [],
    recent: []
  };

  if (!state.storageAvailable) {
    return defaults;
  }

  let parsed;

  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (_error) {
    return defaults;
  }

  if (!parsed || typeof parsed !== "object") {
    return defaults;
  }

  if (parsed.version === 3) {
    return normalizeStorage(parsed);
  }

  if (parsed.version === 2) {
    const migrated = {
      version: 3,
      settings: {
        theme:
          parsed.settings && parsed.settings.theme === "dark"
            ? "dark"
            : defaults.settings.theme,
        unit:
          parsed.settings && parsed.settings.unit === "fahrenheit"
            ? "fahrenheit"
            : "celsius"
      },
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent : []
    };

    return normalizeStorage(migrated);
  }

  return defaults;
}

function normalizeStorage(storage) {
  const theme = storage.settings && storage.settings.theme === "dark" ? "dark" : "light";
  const unit = storage.settings && storage.settings.unit === "fahrenheit" ? "fahrenheit" : "celsius";

  const favorites = dedupeLocations(
    (Array.isArray(storage.favorites) ? storage.favorites : [])
      .map(normalizeLocation)
      .filter((item) => item !== null)
  ).slice(0, MAX_FAVORITES);

  const recent = dedupeLocations(
    (Array.isArray(storage.recent) ? storage.recent : [])
      .map(normalizeLocation)
      .filter((item) => item !== null)
  ).slice(0, MAX_RECENT);

  return {
    version: STORAGE_VERSION,
    settings: {
      theme: theme,
      unit: unit
    },
    favorites: favorites,
    recent: recent
  };
}

function persistStorage() {
  if (!state.storageAvailable) {
    return;
  }

  const payload = {
    version: STORAGE_VERSION,
    settings: {
      theme: state.settings.theme,
      unit: state.settings.unit
    },
    favorites: state.favorites,
    recent: state.recent
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (_error) {
    state.storageAvailable = false;
    showToast("Storage quota reached. New changes are temporary.", "error", 4200);
  }
}

function normalizeLocation(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const lat = Number(raw.latitude);
  const lon = Number(raw.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !raw.name) {
    return null;
  }

  const city = {
    name: String(raw.name).trim(),
    country: raw.country ? String(raw.country).trim() : "",
    admin1: raw.admin1 ? String(raw.admin1).trim() : "",
    latitude: lat,
    longitude: lon,
    timezone: raw.timezone ? String(raw.timezone).trim() : ""
  };

  city.id = cityId(city);
  return city;
}

function cityId(city) {
  return [
    city.name.toLowerCase(),
    city.country.toLowerCase(),
    city.admin1.toLowerCase(),
    city.latitude.toFixed(4),
    city.longitude.toFixed(4)
  ].join("|");
}

function dedupeLocations(list) {
  const seen = new Set();
  const unique = [];

  list.forEach((city) => {
    if (!city || !city.id || seen.has(city.id)) {
      return;
    }

    seen.add(city.id);
    unique.push(city);
  });

  return unique;
}

function findInLocalLists(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const local = dedupeLocations(state.recent.concat(state.favorites));

  return (
    local.find((city) => {
      return formatCityDisplay(city).toLowerCase().indexOf(normalized) >= 0;
    }) || null
  );
}
