const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const app = require("../src/app");
const cases = require("./cases.json");

let server;
let baseUrl;

before(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

async function postAnalyze(body) {
    return fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
}

test("traditional engine classifies the declared comparison cases", async () => {
    for (const testCase of cases) {
        const response = await postAnalyze({
            message: testCase.message,
            mode: "traditional"
        });
        const result = await response.json();

        assert.equal(response.status, 200, testCase.id);
        assert.equal(result.category, testCase.expectedCategory, testCase.id);
        assert.equal(result.priority, testCase.expectedPriority, testCase.id);
        assert.equal(result.mode, "traditional", testCase.id);
        assert.equal(typeof result.response, "string", testCase.id);
        assert.equal(typeof result.requiresHumanReview, "boolean", testCase.id);
        if (testCase.expectedCategory === "SECURITY") {
            assert.equal(result.requiresHumanReview, true, testCase.id);
        }
        if (testCase.id === "ambiguous") {
            assert.equal(result.requiresHumanReview, true, testCase.id);
        }
    }
});

test("request validation rejects missing, empty, oversized and invalid-mode input", async () => {
    const invalidRequests = [
        {},
        { message: "  ", mode: "traditional" },
        { message: "a".repeat(5001), mode: "traditional" },
        { message: "Ayuda", mode: "simulated" }
    ];

    for (const body of invalidRequests) {
        const response = await postAnalyze(body);
        const result = await response.json();
        assert.equal(response.status, 400);
        assert.equal(result.error.code, "VALIDATION_ERROR");
    }
});

test("request validation accepts the 5000-character message limit", async () => {
    const response = await postAnalyze({
        message: "x".repeat(5000),
        mode: "traditional"
    });

    assert.equal(response.status, 200);
});

test("malformed JSON receives a safe client error", async () => {
    const response = await fetch(`${baseUrl}/api/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.equal(result.error.code, "INVALID_JSON");
});

test("generative mode clearly reports missing API configuration", async () => {
    const priorKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
        const response = await postAnalyze({
            message: "No puedo iniciar sesión.",
            mode: "generative"
        });
        const result = await response.json();

        assert.equal(response.status, 503);
        assert.equal(result.error.code, "AI_CONFIGURATION_ERROR");
        assert.match(result.error.message, /GEMINI_API_KEY/);
    } finally {
        if (priorKey !== undefined) {
            process.env.GEMINI_API_KEY = priorKey;
        }
    }
});
