const { analyzeTraditional } = require("../services/traditional.engine");
const { analyzeGenerative } = require("../services/generative.engine");

async function analyzeController(req, res, next) {
    try {
        const { message, mode } = req.validatedBody;
        const result = mode === "traditional"
            ? analyzeTraditional(message)
            : await analyzeGenerative(message);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

module.exports = analyzeController;