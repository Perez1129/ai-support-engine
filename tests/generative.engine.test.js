const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    analyzeGenerative,
    createGeminiClient,
    GEMINI_BASE_URL
} = require("../src/services/generative.engine");
const cases = require("./cases.json");

function mockClient(output) {
    const calls = [];
    return {
        calls,
        client: {
            chat: {
                completions: {
                    create: async (request) => {
                        calls.push(request);
                        return {
                            choices: [
                                { message: { content: output } }
                            ]
                        };
                    }
                }
            }
        }
    };
}

test("generative engine validates the model response and returns the shared contract", async () => {
    const mock = mockClient(JSON.stringify({
        category: "ACCESS",
        priority: "MEDIUM",
        response: "Le ayudaremos a recuperar el acceso a su cuenta.",
        requiresHumanReview: false
    }));

    const result = await analyzeGenerative("No puedo iniciar sesión.", {
        client: mock.client
    });

    assert.deepEqual(result, {
        category: "ACCESS",
        priority: "MEDIUM",
        response: "Le ayudaremos a recuperar el acceso a su cuenta.",
        requiresHumanReview: false,
        mode: "generative"
    });
    assert.equal(mock.calls[0].response_format.type, "json_object");
    assert.equal(mock.calls[0].messages[0].role, "system");
    assert.equal(mock.calls[0].model, process.env.GEMINI_MODEL || "gemini-3.8-flash");
});

test("Gemini client uses the configured OpenAI-compatible base URL", () => {
    const client = createGeminiClient("test-key");

    assert.equal(client.baseURL, GEMINI_BASE_URL);
});

test("security output always requires human review", async () => {
    const mock = mockClient(JSON.stringify({
        category: "SECURITY",
        priority: "CRITICAL",
        response: "El incidente se derivará al equipo de seguridad.",
        requiresHumanReview: false
    }));

    const result = await analyzeGenerative("Detecté una vulnerabilidad.", {
        client: mock.client
    });
    assert.equal(result.requiresHumanReview, true);
});

test("both prompt-injection cases remain untrusted data under fixed instructions", async () => {
    const injectionCases = cases.filter((testCase) => testCase.id.startsWith("injection-"));

    for (const testCase of injectionCases) {
        const mock = mockClient(JSON.stringify({
            category: testCase.expectedCategory,
            priority: testCase.expectedPriority,
            response: "Solicitud recibida para su análisis.",
            requiresHumanReview: false
        }));

        const result = await analyzeGenerative(testCase.message, {
            client: mock.client
        });
        const request = mock.calls[0];
        assert.equal(result.category, testCase.expectedCategory, testCase.id);
        assert.equal(result.priority, testCase.expectedPriority, testCase.id);
        assert.match(request.messages[0].content, /dato no confiable/);
        assert.match(request.messages[0].content, /prompt injection/);
        assert.deepEqual(JSON.parse(request.messages[1].content), {
            untrusted_user_message: testCase.message
        });
    }
});

test("invalid or malformed model output is rejected without returning its content", async () => {
    const mock = mockClient(JSON.stringify({
        category: "OTHER",
        priority: "EXTREME",
        response: "",
        requiresHumanReview: "no"
    }));

    await assert.rejects(
        analyzeGenerative("Mensaje", { client: mock.client }),
        (error) => error.code === "AI_INVALID_RESPONSE" && error.statusCode === 502
    );
});

test("non-JSON model output is rejected", async () => {
    const mock = mockClient("not JSON");

    await assert.rejects(
        analyzeGenerative("Mensaje", { client: mock.client }),
        (error) => error.code === "AI_INVALID_RESPONSE" && error.statusCode === 502
    );
});

test("provider failures are returned as sanitized errors", async () => {
    const client = {
        chat: {
            completions: {
                create: async () => {
                    throw new Error("private provider details");
                }
            }
        }
    };

    await assert.rejects(
        analyzeGenerative("Mensaje", { client }),
        (error) => error.code === "AI_PROVIDER_ERROR"
            && error.publicMessage === "No fue posible obtener una clasificación del proveedor de IA."
            && !error.publicMessage.includes("private provider details")
    );
});

test("provider diagnostics include useful details without logging credentials", async () => {
    const apiKey = "test-gemini-secret";
    const priorKey = process.env.GEMINI_API_KEY;
    const model = "test-gemini-model";
    const priorModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = apiKey;
    process.env.GEMINI_MODEL = model;
    const providerError = Object.assign(new Error(`Request failed with ${apiKey} using ${model}`), {
        status: 429,
        code: "rate_limit_exceeded",
        type: "provider_error",
        error: {
            message: "Quota exceeded",
            api_key: apiKey
        },
        response: {
            data: {
                message: `Rejected ${apiKey}`,
                model,
                headers: {
                    Authorization: `Bearer ${apiKey}`
                }
            }
        }
    });
    const client = {
        chat: {
            completions: {
                create: async () => {
                    throw providerError;
                }
            }
        }
    };
    const originalConsoleError = console.error;
    const loggedArguments = [];
    console.error = (...args) => loggedArguments.push(args);

    try {
        await assert.rejects(
            analyzeGenerative("Mensaje", { client }),
            (error) => error.code === "AI_PROVIDER_ERROR"
                && error.publicMessage === "No fue posible obtener una clasificación del proveedor de IA."
        );
    } finally {
        console.error = originalConsoleError;
        if (priorKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = priorKey;
        }
        if (priorModel === undefined) {
            delete process.env.GEMINI_MODEL;
        } else {
            process.env.GEMINI_MODEL = priorModel;
        }
    }

    assert.equal(loggedArguments.length, 1);
    assert.equal(loggedArguments[0][0], "Falló la solicitud al proveedor generativo.");
    const diagnostic = loggedArguments[0][1];
    assert.equal(diagnostic.status, 429);
    assert.equal(diagnostic.code, "rate_limit_exceeded");
    assert.equal(diagnostic.type, "provider_error");
    assert.match(diagnostic.message, /\[REDACTED\]/);
    assert.equal(diagnostic.error.api_key, "[REDACTED]");
    assert.equal(diagnostic.response.data.headers.Authorization, "[REDACTED]");
    assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(apiKey));
    assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(model));
});
