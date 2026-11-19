const { spawn } = require("node:child_process");
const { resolve } = require("node:path");
const { analyzeTraditional } = require("./traditional.engine");

const script = resolve(__dirname, "../../ml/classifier.py");
const responses = {
    ACCESS: "Revise las opciones de recuperación de cuenta del portal oficial.",
    BUG: "Gracias por informar el error. Indíquenos qué acción realizó antes de que ocurriera.",
    FEATURE: "Gracias por la sugerencia. El equipo evaluará la función solicitada.",
    SECURITY: "El equipo de seguridad revisará este posible incidente. Evite compartir credenciales."
};

function predictCategory(message) {
    return new Promise((resolvePrediction, reject) => {
        const child = spawn(process.env.ML_PYTHON || (process.platform === "win32" ? "python" : "python3"),
            [script, "predict"], {
                stdio: ["pipe", "pipe", "ignore"],
                timeout: 15000
            });
        child.stdout.setEncoding("utf8");
        let output = "";
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stdin.on("error", reject);
        child.on("error", reject);
        child.on("close", (code) => {
            try {
                if (code !== 0) throw new Error("Falló la inferencia.");
                const { category } = JSON.parse(output);
                if (!Object.hasOwn(responses, category)) throw new Error("Categoría inválida.");
                resolvePrediction(category);
            } catch (error) {
                reject(error);
            }
        });
        child.stdin.end(JSON.stringify({ message }));
    });
}

async function analyzeML(message) {
    let category;
    try {
        category = await predictCategory(message);
    } catch {
        throw Object.assign(new Error("Motor ML no disponible."), {
            statusCode: 503,
            code: "ML_UNAVAILABLE",
            publicMessage: "Revisa el entorno de Python y entrena el clasificador antes de usar el modo ml."
        });
    }
    const traditional = analyzeTraditional(message);
    const requiresSecurityReview = category === "SECURITY" || traditional.category === "SECURITY";
    return {
        category,
        priority: requiresSecurityReview ? "CRITICAL"
            : traditional.category === category ? traditional.priority
                : category === "FEATURE" ? "LOW" : "MEDIUM",
        response: requiresSecurityReview ? responses.SECURITY : responses[category],
        requiresHumanReview: requiresSecurityReview || traditional.requiresHumanReview || traditional.category !== category,
        mode: "ml"
    };
}

module.exports = { analyzeML };
