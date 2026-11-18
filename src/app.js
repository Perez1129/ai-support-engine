const express = require("express");
const analyzeRoutes = require("./routes/analyze.routes");
const errorHandler = require("./middleware/error-handler");

const app = express();

app.use(express.json({ limit: "16kb" }));
app.use("/api/analyze", analyzeRoutes);

app.use((req, res) => {
    res.status(404).json({
        error: {
            code: "NOT_FOUND",
            message: "La ruta solicitada no existe."
        }
    });
});

app.use(errorHandler);

module.exports = app;