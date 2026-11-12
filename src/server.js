require("dotenv").config();

const app = require("./app");

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => {
    console.log(`AI Support Engine escuchando en el puerto ${port}.`);
});

function shutdown() {
    server.close((error) => {
        if (error) {
            console.error("No se pudo cerrar el servidor correctamente.");
            process.exitCode = 1;
        }
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);