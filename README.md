# Weather Pro

Weather Pro is a mobile-first atmospheric weather app built with vanilla HTML, CSS, and JavaScript.
It uses Open-Meteo APIs (no API key) and runs by opening `index.html` directly in the browser.

## Tech Stack

- Vanilla HTML/CSS/JS
- Chart.js (CDN)
- Open-Meteo Geocoding API
- Open-Meteo Forecast API

## Project Structure

- `index.html`
- `css/style.css`
- `js/app.js`
- `README.md`

## How to Run

1. Open `index.html` directly in a modern browser.
2. Search for a city.

No build tools or local server required.

## Features

- City search with autocomplete (Open-Meteo geocoding)
- Current conditions with hero temperature layout
- Wind, humidity, precipitation, and feels-like details
- 7-day forecast as swipeable cards on mobile
- Hourly temperature chart (Chart.js)
- Unit toggle (C/F)
- Theme toggle (dark/light), persisted
- Dynamic atmospheric gradients based on weather conditions
- Favorites and recent searches, persisted with versioned storage
- Loading skeleton state
- Offline/API error UI with retry
- Toast notification system
- About modal with author credit link
- Accessible interactions (keyboard navigation, ARIA live regions, dialog semantics, focus states)

## Storage

Local storage key: `weather-pro:store`

Schema version: `3`

Stored data:

- `settings.theme`
- `settings.unit`
- `favorites[]`
- `recent[]`

Includes migration support from older versions.

## API Notes

### Geocoding

`https://geocoding-api.open-meteo.com/v1/search?name={query}&count={n}&language=en&format=json`

### Forecast

`https://api.open-meteo.com/v1/forecast?...`

Used fields include:

- `current`: `temperature_2m`, `apparent_temperature`, `relative_humidity_2m`, `weather_code`, `wind_speed_10m`, `precipitation`, `is_day`
- `hourly`: `time`, `temperature_2m`
- `daily`: `time`, `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`

## Reliability and Error Handling

- Timeout + abort-safe API requests
- Graceful handling of network and parsing failures
- Retry workflow for failed weather fetches
- Offline status updates and toasts
- Chart fallback message when CDN/library unavailable
- No intentional console logging in app source

## Accessibility

- Skip link to main content
- Combobox/listbox pattern for autocomplete
- Keyboard support (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`)
- Accessible dialog (`role="dialog"`, `aria-modal`, focus return)
- Focus-visible styles for controls and links
- Reduced-motion support via `prefers-reduced-motion`

Author
HesamCode
Portfolio: https://hesamcode.github.io
