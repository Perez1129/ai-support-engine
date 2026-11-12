const express = require("express");
const analyzeController = require("../controllers/analyze.controller");
const validateAnalyzeRequest = require("../validators/analyze.schema");

const router = express.Router();

router.post("/", validateAnalyzeRequest, analyzeController);

module.exports = router;