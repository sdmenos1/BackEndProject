import express from "express"
import { query } from "../config/database.js"
import { authenticateToken, requireAdmin } from "../middleware/auth.js"
import { validateRequest, schemas } from "../middleware/validation.js"

const router = express.Router()

// Obtener todas las habitaciones
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT r.*, 
             CASE 
               WHEN EXISTS (
                 SELECT 1 FROM reservations res 
                 WHERE res.room_id = r.id 
                 AND res.estado = 'confirmada' 
                 AND CURRENT_DATE BETWEEN res.fecha_inicio AND res.fecha_fin
               ) THEN 'ocupada'
               ELSE r.estado
             END as estado_actual
      FROM rooms r 
      ORDER BY r.numero
    `)

    res.json({
      success: true,
      data: {
        rooms: result.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Obtener habitación por ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await query("SELECT * FROM rooms WHERE id = $1", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Habitación no encontrada",
      })
    }

    res.json({
      success: true,
      data: {
        room: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Crear nueva habitación
router.post("/", authenticateToken, requireAdmin, validateRequest(schemas.room), async (req, res, next) => {
  try {
    const { numero, tipo, precio, capacidad, estado } = req.body

    const result = await query(
      "INSERT INTO rooms (numero, tipo, precio, capacidad, estado) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [numero, tipo, precio, capacidad, estado],
    )

    res.status(201).json({
      success: true,
      message: "Habitación creada exitosamente",
      data: {
        room: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Actualizar habitación
router.put("/:id", authenticateToken, requireAdmin, validateRequest(schemas.room), async (req, res, next) => {
  try {
    const { id } = req.params
    const { numero, tipo, precio, capacidad, estado } = req.body

    const result = await query(
      "UPDATE rooms SET numero = $1, tipo = $2, precio = $3, capacidad = $4, estado = $5 WHERE id = $6 RETURNING *",
      [numero, tipo, precio, capacidad, estado, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Habitación no encontrada",
      })
    }

    res.json({
      success: true,
      message: "Habitación actualizada exitosamente",
      data: {
        room: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Eliminar habitación
router.delete("/:id", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params

    // Verificar si hay reservas activas
    const reservationsCheck = await query(
      "SELECT COUNT(*) as count FROM reservations WHERE room_id = $1 AND estado = $2",
      [id, "confirmada"],
    )

    if (Number.parseInt(reservationsCheck.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: "No se puede eliminar la habitación porque tiene reservas activas",
      })
    }

    const result = await query("DELETE FROM rooms WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Habitación no encontrada",
      })
    }

    res.json({
      success: true,
      message: "Habitación eliminada exitosamente",
    })
  } catch (error) {
    next(error)
  }
})

// Verificar disponibilidad de habitación
router.get("/:id/availability", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    const { fecha_inicio, fecha_fin } = req.query

    if (!fecha_inicio || !fecha_fin) {
      return res.status(400).json({
        success: false,
        message: "Fechas de inicio y fin son requeridas",
      })
    }

    const result = await query(
      `
      SELECT COUNT(*) as conflictos
      FROM reservations 
      WHERE room_id = $1 
      AND estado = 'confirmada'
      AND (
        (fecha_inicio <= $2 AND fecha_fin >= $2) OR
        (fecha_inicio <= $3 AND fecha_fin >= $3) OR
        (fecha_inicio >= $2 AND fecha_fin <= $3)
      )
    `,
      [id, fecha_inicio, fecha_fin],
    )

    const disponible = Number.parseInt(result.rows[0].conflictos) === 0

    res.json({
      success: true,
      data: {
        disponible,
        fecha_inicio,
        fecha_fin,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
