import * as dotenv from "dotenv";
dotenv.config({ debug: false });
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_API_BASE = "https://api.openweathermap.org/data/2.5";
const QUERY_PARAMS = `appid=${API_KEY}&units=metric&lang=it`;

/**
 * Helper function for making OpenWeatherMap API requests
 */
async function makeOpenWeatherRequest<T>(endpoint: string): Promise<T | null> {
  const url = `${OPENWEATHER_API_BASE}/${endpoint}&${QUERY_PARAMS}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Includi il messaggio di errore se disponibile
      const errorData = (await response.json()) as { message?: string };
      throw new Error(
        `HTTP error! status: ${response.status}. Message: ${
          errorData.message || "Unknown error"
        }`
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making OpenWeatherMap request:", error);
    return null;
  }
}

// --- INTERFACCE DATI OPENWEATHERMAP (Simplified) ---

// Struttura per un elemento della previsione (es. temperatura, descrizione)
interface WeatherMain {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
  humidity: number;
}

interface WeatherDescription {
  main: string; // Es. "Clouds"
  description: string; // Es. "nuvole sparse"
  icon: string;
}

interface Wind {
  speed: number;
  deg: number; // Gradi
}

interface CurrentWeatherResponse {
  coord: {
    lat: number;
    lon: number;
  };
  weather: WeatherDescription[];
  main: WeatherMain;
  wind: Wind;
  name: string; // Nome della città
}

function formatWeather(data: CurrentWeatherResponse): string {
  const weather = data.weather[0]; // Prende la prima e principale descrizione
  const main = data.main;
  const wind = data.wind;

  return [
    `Meteo attuale per: **${data.name || "Sconosciuto"}**`,
    "---",
    `🌡️ Temperatura: ${main.temp.toFixed(
      1
    )}°C (Percepita: ${main.feels_like.toFixed(1)}°C)`,
    `Min/Max: ${main.temp_min.toFixed(1)}°C / ${main.temp_max.toFixed(1)}°C`,
    `☀️ Condizioni: ${
      weather.description.charAt(0).toUpperCase() + weather.description.slice(1)
    }`,
    `💨 Vento: ${wind.speed.toFixed(1)} m/s (${wind.deg}°)`,
    `💧 Umidità: ${main.humidity}%`,
    `Pressione: ${main.pressure} hPa`,
  ].join("\n");
}

// --- SERVER MCP ---
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
});

server.registerTool(
  "get-forecast",
  {
    description:
      "Ottieni la previsione meteo attuale per una posizione in Italia o Europa (e nel mondo)",
    inputSchema: {
      latitude: z
        .number()
        .min(-90)
        .max(90)
        .describe("Latitudine della posizione"),
      longitude: z
        .number()
        .min(-180)
        .max(180)
        .describe("Longitudine della posizione"),
    },
  },
  async ({ latitude, longitude }) => {
    const endpoint = `weather?lat=${latitude.toFixed(
      4
    )}&lon=${longitude.toFixed(4)}`;
    const weatherData = await makeOpenWeatherRequest<CurrentWeatherResponse>(
      endpoint
    );
    console.error("🚀 ~ weatherData:", weatherData);
    if (!API_KEY) {
      return {
        content: [
          {
            type: "text",
            text: "La chiave API di OpenWeatherMap non è configurata correttamente sul server.",
          },
        ],
      };
    }
    if (!weatherData) {
      return {
        content: [
          {
            type: "text",
            text: "Impossibile recuperare i dati meteo. Verifica le coordinate.",
          },
        ],
      };
    }

    const forecastText = formatWeather(weatherData);

    return {
      content: [
        {
          type: "text",
          text: forecastText,
        },
      ],
    };
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP Server running on stdio (using OpenWeatherMap)");
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(`Fatal error in main(): ${error.message}`);
  } else {
    console.error("An unexpected error occurred:", String(error));
  }
  process.exit(1);
});
