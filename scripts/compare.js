require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { analyzeTraditional } = require("../src/services/traditional.engine");
const { analyzeGenerative } = require("../src/services/generative.engine");

const root = path.resolve(__dirname, "..");
const cases = require("../tests/cases.json");
const offline = process.argv.includes("--offline");

function isValidContract(result, mode) {
    return result
        && ["ACCESS", "BUG", "FEATURE", "SECURITY"].includes(result.category)
        && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(result.priority)
        && typeof result.response === "string"
        && result.response.trim().length > 0
        && typeof result.requiresHumanReview === "boolean"
        && result.mode === mode;
}

function accuracySummary(results, mode) {
    const evaluated = results.filter((result) => result[mode]);
    const correct = evaluated.filter((result) => result[`${mode}Correct`]).length;
    return {
        correct,
        evaluatedCases: evaluated.length,
        totalCases: results.length,
        accuracyPercent: evaluated.length === results.length
            ? Number(((correct / results.length) * 100).toFixed(2))
            : null
    };
}

function markdownReport(report) {
    const lines = [
        "# Comparación de motores",
        "",
        `Fecha UTC: ${report.generatedAt}`,
        `Ejecución Gemini: ${report.generativeRun.status}`,
        "",
        "| Caso | Mensaje original | Esperado (categoría / prioridad) | Tradicional (categoría / prioridad) | Exacta | Gemini (categoría / prioridad) | Exacta | JSON válido |",
        "|---|---|---|---|---:|---|---:|---|"
    ];

    for (const item of report.results) {
        const cells = [
            item.id,
            item.message.replace(/\|/g, "\\|").replace(/\r?\n/g, " "),
            `${item.expectedCategory} / ${item.expectedPriority}`,
            `${item.traditional.category} / ${item.traditional.priority}`,
            item.traditionalCorrect ? "Sí" : "No",
            item.generative
                ? `${item.generative.category} / ${item.generative.priority}`
                : "No ejecutada",
            item.generativeCorrect === null ? "N/D" : item.generativeCorrect ? "Sí" : "No",
            `Tradicional: ${item.traditionalValidJson ? "Sí" : "No"}; Gemini: ${item.generativeValidJson === null ? "N/D" : item.generativeValidJson ? "Sí" : "No"}`
        ];
        lines.push(`| ${cells.join(" | ")} |`);
    }

    lines.push(
        "",
        `- Exactitud tradicional: ${report.accuracy.traditional.accuracyPercent === null ? "N/D" : `${report.accuracy.traditional.accuracyPercent}%`} (${report.accuracy.traditional.correct}/${report.accuracy.traditional.evaluatedCases} evaluados).`,
        `- Exactitud generativa: ${report.accuracy.generative.accuracyPercent === null ? "N/D" : `${report.accuracy.generative.accuracyPercent}%`} (${report.accuracy.generative.correct}/${report.accuracy.generative.evaluatedCases} evaluados).`,
        "- Las llamadas reales a Gemini se distinguen de las pruebas automatizadas con mocks."
    );
    return `${lines.join("\n")}\n`;
}

async function main() {
    const results = [];

    for (const testCase of cases) {
        const traditional = analyzeTraditional(testCase.message);
        const row = {
            id: testCase.id,
            message: testCase.message,
            expectedCategory: testCase.expectedCategory,
            expectedPriority: testCase.expectedPriority,
            traditional,
            traditionalValidJson: isValidContract(traditional, "traditional"),
            traditionalCorrect: traditional.category === testCase.expectedCategory
                && traditional.priority === testCase.expectedPriority,
            generative: null,
            generativeValidJson: null,
            generativeCorrect: null,
            generativeError: null
        };

        if (process.env.GEMINI_API_KEY && !offline) {
            try {
                const generative = await analyzeGenerative(testCase.message);
                row.generative = generative;
                row.generativeValidJson = isValidContract(generative, "generative");
                row.generativeCorrect = generative.category === testCase.expectedCategory
                    && generative.priority === testCase.expectedPriority;
            } catch (error) {
                row.generativeError = {
                    code: error.code || "AI_PROVIDER_ERROR",
                    message: error.publicMessage || "La llamada generativa falló."
                };
            }
        }

        results.push(row);
    }

    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY) && !offline;
    const generativeConfigured = geminiConfigured;
    const generativeComplete = generativeConfigured
        && results.every((result) => result.generative !== null);
    const report = {
        generatedAt: new Date().toISOString(),
        source: "gemini-comparison",
        casesFile: "tests/cases.json",
        generativeRun: {
            status: offline
                ? "skipped_offline"
                : !generativeConfigured
                    ? "not_configured"
                    : generativeComplete
                        ? "real_gemini_api"
                        : "real_gemini_api_partial_failure",
            model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
            note: offline
                ? "Ejecución offline solicitada. No se hicieron llamadas a Gemini."
                : !process.env.GEMINI_API_KEY
                    ? "No se llamó al motor generativo: falta GEMINI_API_KEY. No se simularon resultados."
                    : generativeComplete
                        ? "Resultados obtenidos mediante llamadas reales a Gemini con el SDK OpenAI-compatible."
                        : "Una o más llamadas reales a Gemini fallaron; no se simularon resultados."
        },
        accuracy: {
            traditional: accuracySummary(results, "traditional"),
            generative: generativeComplete
                ? accuracySummary(results, "generative")
                : {
                    correct: results.filter((result) => result.generativeCorrect === true).length,
                    evaluatedCases: results.filter((result) => result.generative !== null).length,
                    totalCases: results.length,
                    accuracyPercent: null
                }
        },
        results
    };

    const geminiEvidenceDir = path.join(root, "evidence", "gemini");
    await fs.mkdir(geminiEvidenceDir, { recursive: true });
    const generativeEvidence = {
        generatedAt: report.generatedAt,
        source: generativeConfigured ? "real-gemini-api" : "not-executed",
        status: report.generativeRun.status,
        model: report.generativeRun.model,
        note: report.generativeRun.note,
        accuracy: report.accuracy.generative,
        results: results.filter((result) => result.generative || result.generativeError).map((result) => ({
            id: result.id,
            message: result.message,
            expectedCategory: result.expectedCategory,
            expectedPriority: result.expectedPriority,
            result: result.generative,
            validJson: result.generativeValidJson,
            exact: result.generativeCorrect,
            error: result.generativeError
        }))
    };
    await fs.writeFile(
        path.join(geminiEvidenceDir, "generative-results.json"),
        `${JSON.stringify(generativeEvidence, null, 2)}\n`
    );
    await Promise.all([
        fs.writeFile(path.join(geminiEvidenceDir, "comparison-results.json"), `${JSON.stringify(report, null, 2)}\n`),
        fs.writeFile(path.join(geminiEvidenceDir, "comparison-results.md"), markdownReport(report))
    ]);

    console.log(`Casos evaluados: ${cases.length}.`);
    console.log(`Exactitud tradicional: ${report.accuracy.traditional.accuracyPercent}%.`);
    console.log(`Exactitud Gemini: ${report.accuracy.generative.accuracyPercent === null ? "N/D" : `${report.accuracy.generative.accuracyPercent}%`}.`);
    console.log(`Estado Gemini: ${report.generativeRun.status}.`);
    console.log("Resultados nuevos: evidence/gemini/. Las evidencias anteriores se conservan.");
}

main().catch((error) => {
    console.error("No se pudo completar la comparación.", error.message || error.name || "Error");
    process.exitCode = 1;
});
