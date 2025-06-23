export const errorHandler = (err, req, res, next) => {
  console.error("❌ Error:", err)

  // Error de validación de Zod
  if (err.name === "ZodError") {
    return res.status(400).json({
      success: false,
      message: "Datos de entrada inválidos",
      errors: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    })
  }

  if (err.code === "23505") {
    // Unique violation
    return res.status(409).json({
      success: false,
      message: "El registro ya existe",
    })
  }

  if (err.code === "23503") {
    // Foreign key violation
    return res.status(400).json({
      success: false,
      message: "Referencia inválida",
    })
  }

  // Error de JWT
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Token inválido",
    })
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expirado",
    })
  }

  // Error genérico
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Error interno del servidor",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  })
}
