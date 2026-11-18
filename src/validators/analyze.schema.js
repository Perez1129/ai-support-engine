const { z } = require("zod");

const analyzeRequestSchema = z.object({
    message: z.string().trim().min(1, "El mensaje no puede estar vacío.").max(5000, "El mensaje no puede superar 5000 caracteres."),
    mode: z.enum(["traditional", "generative"])
});

function validateAnalyzeRequest(req, res, next) {
    const result = analyzeRequestSchema.safeParse(req.body);

    if (!result.success) {
        return res.status(400).json({
            error: {
                code: "VALIDATION_ERROR",
                message: "La solicitud no es válida.",
                details: result.error.issues.map(({ path, message }) => ({
                    field: path.join("."),
                    message
                }))
            }
        });
    }

    req.validatedBody = result.data;
    next();
}

module.exports = validateAnalyzeRequest;