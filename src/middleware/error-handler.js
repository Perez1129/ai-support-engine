function errorHandler(error, req, res, next) {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            error: {
                code: "INVALID_JSON",
                message: "El cuerpo de la solicitud debe ser JSON válido."
            }
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            error: {
                code: "PAYLOAD_TOO_LARGE",
                message: "El cuerpo de la solicitud es demasiado grande."
            }
        });
    }

    if (error.statusCode && error.code) {
        return res.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.publicMessage
            }
        });
    }

    console.error("Error interno al procesar la solicitud.", {
        name: error.name || "Error"
    });

    return res.status(500).json({
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Ocurrió un error interno. Inténtelo de nuevo más tarde."
        }
    });
}

module.exports = errorHandler;
