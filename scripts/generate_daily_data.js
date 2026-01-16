const fs = require('fs');
const path = require('path');

// Configuration
const SENSORS_FILE = path.join(__dirname, '../data/sensores.json');
const HISTORY_MM_FILE = path.join(__dirname, '../data/historyu_mm_rain.json');
const HISTORY_SENSORS_FILE = path.join(__dirname, '../data/history_sensores.json');

const PREDICTIONS_FILE = path.join(__dirname, '../data/previsao_tempo.json');
const CSV_FILE = path.join(__dirname, '../data/iot_1514_Clima_1765854000_1768571999.604.csv');

// Forecast inputs (Simulated/Manual)
const manualForecast = [
    { day: "16", month: "01", mm: 0.8, scenario: "Sol com nuvens" },
    { day: "17", month: "01", mm: 0.9, scenario: "Chuva fraca" },
    { day: "18", month: "01", mm: 1.8, scenario: "Sol com chuva" },
    { day: "19", month: "01", mm: 1.9, scenario: "Chuva" },
    { day: "20", month: "01", mm: 0.9, scenario: "Chuva fraca" },
    { day: "21", month: "01", mm: 0.2, scenario: "Chuva isolada" },
    { day: "22", month: "01", mm: 0.6, scenario: "Ensolarado" },
    { day: "23", month: "01", mm: 1.0, scenario: "Chuva fraca" },
    { day: "24", month: "01", mm: 10.4, scenario: "Chuva forte" }, // Expect High risk
    { day: "25", month: "01", mm: 4.9, scenario: "Chuva moderada" },
    { day: "26", month: "01", mm: 1.9, scenario: "Sol com chuva" },
    { day: "27", month: "01", mm: 4.0, scenario: "Sol com pancadas" },
    { day: "28", month: "01", mm: 0.4, scenario: "Sol com nuvens" },
    { day: "29", month: "01", mm: 0.0, scenario: "Ensolarado" },
    { day: "30", month: "01", mm: 13.7, scenario: "Tempestade" }  // Expect Critical risk
];

// Helper: Risk Category
function getCategory(score) {
    if (score < 50) return 'pouca';
    if (score < 75) return 'media';
    if (score < 90) return 'alta';
    return 'critica';
}

async function main() {
    try {
        console.log("Loading sensors...");
        const sensorsRaw = fs.readFileSync(SENSORS_FILE, 'utf8');
        const sensorsJson = JSON.parse(sensorsRaw);
        const sensors = sensorsJson.sensors;

        if (!Array.isArray(sensors)) throw new Error("sensors is not an array");

        // 1. Process Historical Rain (CSV)
        console.log("Processing CSV history...");
        const historyData = processCsv(CSV_FILE);
        fs.writeFileSync(HISTORY_MM_FILE, JSON.stringify(historyData, null, 2), 'utf8');
        console.log(`Saved history to ${HISTORY_MM_FILE}`);

        // 2. Generate Historical Overflows with "Hidden Personality"
        // Assign a random bias to each sensor to simulate real-world variance (clogs, terrain features not mapped)
        const sensorBias = {};
        const sensorVulnerability = {}; // Helper to hold simulated vulnerability
        sensors.forEach(s => {
            // Bias 0.7 (resilient) to 1.5 (sensitive)
            sensorBias[s.sensor_id] = 0.7 + Math.random() * 0.8;
            // Simulated Vulnerability 0.2 to 0.9 (since we removed it from JSON)
            sensorVulnerability[s.sensor_id] = 0.2 + Math.random() * 0.7;
        });

        const historySensors = [];
        historyData.forEach(day => {
            if (day.mm > 2) { // Minimal rain check
                sensors.forEach(s => {
                    // Logic: Rain * Vuln * Bias
                    // We normalize so ~15mm is a danger event for a generic sensor
                    const pressure = day.mm * (sensorVulnerability[s.sensor_id] + 0.5) * sensorBias[s.sensor_id];

                    // Historical Threshold: Let's say pressure > 8 creates an overflow entry
                    const isOverflow = pressure > 8;

                    // We save data mainly if it overflowed or was close
                    if (pressure > 5) {
                        historySensors.push({
                            sensor_id: s.sensor_id,
                            date: day.date,
                            rain_mm_day: day.mm,
                            extravasamento: isOverflow
                        });
                    }
                });
            }
        });
        fs.writeFileSync(HISTORY_SENSORS_FILE, JSON.stringify(historySensors, null, 2), 'utf8');
        console.log(`Saved ${historySensors.length} events to ${HISTORY_SENSORS_FILE}`);

        // 3. Forecast Generation (Raw Weather Only)
        // No more pre-baked scores! The frontend must calculate them.
        const predictions = {
            generated_at: new Date().toISOString(),
            forecasts: []
        };
        const year = "2026";

        manualForecast.forEach(item => {
            const dateStr = `${year}-${item.month}-${item.day}`;
            predictions.forecasts.push({
                date: dateStr,
                rain_mm_forecast: item.mm,
                scenario: item.scenario
            });
        });

        fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictions, null, 2), 'utf8');
        console.log(`Saved raw forecast to ${PREDICTIONS_FILE} (No scores included)`);

        fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictions, null, 2), 'utf8');
        console.log(`Saved intelligent predictions to ${PREDICTIONS_FILE}`);

    } catch (e) {
        console.error("FATAL ERROR IN MAIN:", e);
    }
}

function processCsv(filePath) {
    try {
        if (!fs.existsSync(filePath)) return [];
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        const dailySums = {};

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const cols = line.split(';');
            if (cols.length < 12) continue;
            const clean = (val) => val ? val.replace(/^"|"$/g, '') : '';
            if (clean(cols[7]) !== 'Nível de Chuva') continue;

            const val = parseFloat(clean(cols[9]).replace(',', '.'));
            const dateStr = clean(cols[11]);

            if (isNaN(val) || !dateStr.includes('T')) continue;
            const datePart = dateStr.split('T')[0];

            if (!dailySums[datePart]) dailySums[datePart] = 0;
            dailySums[datePart] += val;
        }

        return Object.keys(dailySums).sort().map(date => ({
            date: date,
            mm: parseFloat(dailySums[date].toFixed(2)),
            is_forecast: false
        }));
    } catch (e) {
        console.error("Error in processCsv:", e);
        return [];
    }
}

main();
