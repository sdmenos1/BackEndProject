import jwt from "jsonwebtoken"
import { query } from "../config/database.js"

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token de acceso requerido",
    })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Verificar que el usuario existe y obtener todos los campos incluyendo DNI y TELEFONO
    const result = await query("SELECT id, nombre, email, dni, telefono, rol FROM users WHERE id = $1", [
      decoded.userId,
    ])

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Usuario no encontrado",
      })
    }

    req.user = result.rows[0]
    next()
  } catch (error) {
    console.error("Error en autenticación:", error)
    return res.status(403).json({
      success: false,
      message: "Token inválido",
    })
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.user.rol !== "administrador") {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Se requieren permisos de administrador",
    })
  }
  next()
}

export const requireClientOrAdmin = (req, res, next) => {
  if (req.user.rol !== "cliente" && req.user.rol !== "administrador") {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado. Se requiere cuenta de cliente o administrador",
    })
  }
  next()
}
