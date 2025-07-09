import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { query } from "../config/database.js"
import { validateRequest, schemas } from "../middleware/validation.js"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()


// Registro de usuario - ACTUALIZADO para manejar nombres y apellidos separados
router.post("/register", validateRequest(schemas.register), async (req, res, next) => {
  try {
    const { nombres, apellidos, email, password, dni, telefono, rol } = req.body

    // Combinar nombres y apellidos en un solo campo
    const nombreCompleto = `${nombres} ${apellidos}`.trim()

    // Verificar si el usuario ya existe (email o DNI)
    const existingUser = await query("SELECT id FROM users WHERE email = $1 OR dni = $2", [email, dni])

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "El email o DNI ya están registrados",
      })
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 12)

    // Crear usuario con nombre completo
    const result = await query(
      "INSERT INTO users (nombre, email, password, dni, telefono, rol) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, dni, telefono, rol",
      [nombreCompleto, email, hashedPassword, dni, telefono, rol],
    )

    const user = result.rows[0]

    // Generar token
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "24h" })

    res.status(201).json({
      success: true,
      message: "Usuario registrado exitosamente",
      data: {
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          dni: user.dni,
          telefono: user.telefono,
          rol: user.rol,
        },
        token,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Login de usuario (sin cambios)
router.post("/login", validateRequest(schemas.login), async (req, res, next) => {
  try {
    const { email, password } = req.body

    // Buscar usuario
    const result = await query("SELECT * FROM users WHERE email = $1", [email])
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      })
    }

    const user = result.rows[0]

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      })
    }

    // Generar token
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "24h" })

    res.json({
      success: true,
      message: "Login exitoso",
      data: {
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          dni: user.dni,
          telefono: user.telefono,
          rol: user.rol,
        },
        token,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Obtener perfil del usuario autenticado
router.get("/me", authenticateToken, async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
    },
  })
})

// Actualizar perfil de usuario - ACTUALIZADO
router.put("/profile", authenticateToken, validateRequest(schemas.updateProfile), async (req, res, next) => {
  try {
    const userId = req.user.id
    const { nombres, apellidos, dni, telefono } = req.body

    // Construir query dinámicamente según los campos enviados
    const updates = []
    const values = []
    let paramCount = 1

    // Si se envían nombres y apellidos, combinarlos
    if (nombres || apellidos) {
      const nombreActual = req.user.nombre.split(" ")
      const nuevoNombre = nombres || nombreActual[0] || ""
      const nuevosApellidos = apellidos || nombreActual.slice(1).join(" ") || ""
      const nombreCompleto = `${nuevoNombre} ${nuevosApellidos}`.trim()

      updates.push(`nombre = $${paramCount}`)
      values.push(nombreCompleto)
      paramCount++
    }

    if (dni) {
      // Verificar que el DNI no esté en uso por otro usuario
      const existingDNI = await query("SELECT id FROM users WHERE dni = $1 AND id != $2", [dni, userId])
      if (existingDNI.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: "El DNI ya está en uso por otro usuario",
        })
      }
      updates.push(`dni = $${paramCount}`)
      values.push(dni)
      paramCount++
    }

    if (telefono) {
      updates.push(`telefono = $${paramCount}`)
      values.push(telefono)
      paramCount++
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No se proporcionaron campos para actualizar",
      })
    }

    // Agregar WHERE clause
    values.push(userId)
    const queryText = `UPDATE users SET ${updates.join(", ")} WHERE id = $${paramCount} RETURNING id, nombre, email, dni, telefono, rol`

    const result = await query(queryText, values)

    res.json({
      success: true,
      message: "Perfil actualizado exitosamente",
      data: {
        user: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
