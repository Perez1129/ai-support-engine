function normalizeText(text) {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function analyzeTraditional(message) {
    const text = normalizeText(message);

    let category;
    let priority;
    let requiresHumanReview = false;
    let response;

    // 1. Detectar incidentes de seguridad
    const securityKeywords = [
        "vulnerabilidad",
        "hackeo",
        "ataque",
        "filtracion",
        "datos expuestos",
        "acceso no autorizado",
        "phishing",
        "malware",
        "ransomware",
        "inyeccion sql",
        "xss"
    ];

    if (securityKeywords.some(keyword => text.includes(keyword))) {
        category = "SECURITY";
        priority = "CRITICAL";
        requiresHumanReview = true;

        response = "Se ha identificado un posible incidente de seguridad. El caso será enviado al equipo especializado para su revisión inmediata.";
    }

    // 2. Detectar problemas de acceso
    else if (
        /iniciar sesion|iniciar sesión|login|contrasena|password|credenciales|cuenta bloqueada|no puedo acceder|problemas de acceso/.test(text)
    ) {
        category = "ACCESS";
        priority = text.includes("bloqueada") ? "HIGH" : "MEDIUM";

        response = "Hemos identificado un problema relacionado con el acceso. Verificaremos sus credenciales y el estado de su cuenta para ayudarle a recuperar el acceso.";
    }

    // 3. Detectar solicitudes de nuevas funcionalidades
    else if (
        /agregar|anadir|implementar|nueva funcion|nueva caracteristica|me gustaria|solicito|necesito una opcion|crear una funcion/.test(text)
    ) {
        category = "FEATURE";
        priority = "LOW";

        response = "Hemos registrado su solicitud de nueva funcionalidad. El equipo de desarrollo evaluará su viabilidad y prioridad.";
    }

    // 4. Detectar errores del sistema
    else if (
        /error|falla|fallo|bug|no funciona|no carga|se cierra|pantalla blanca|crash|problema tecnico/.test(text)
    ) {
        category = "BUG";

        const urgentKeywords = [
            "caido",
            "caida",
            "todos los usuarios",
            "produccion",
            "no funciona nada",
            "imposible trabajar"
        ];

        priority = urgentKeywords.some(keyword => text.includes(keyword))
            ? "HIGH"
            : "MEDIUM";

        response = "Hemos identificado un posible error del sistema. El equipo técnico revisará el problema para determinar su causa y solución.";
    }

    // 5. Solicitudes ambiguas o sin coincidencias
    else {
        category = "BUG";
        priority = "MEDIUM";
        requiresHumanReview = true;

        response = "No fue posible identificar claramente el tipo de solicitud. El caso será enviado a revisión humana para determinar cómo atenderlo.";
    }

    return {
        category,
        priority,
        response,
        requiresHumanReview,
        mode: "traditional"
    };
}

module.exports = { analyzeTraditional };
