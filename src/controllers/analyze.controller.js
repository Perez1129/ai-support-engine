const { analyzeTraditional } = require("../services/traditional.engine");
const { analyzeGenerative } = require("../services/generative.engine");

const { analyzeML } = require("../services/ml.engine");

const engines = { traditional: analyzeTraditional, generative: analyzeGenerative, ml: analyzeML };

async function analyzeController(req, res, next) {
    try {
        const { message, mode } = req.validatedBody;
        const result = await engines[mode](message);

        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

module.exports = analyzeController;