import express from "express"
import { query } from "../config/database.js"
import { authenticateToken, requireAdmin } from "../middleware/auth.js"
import { validateRequest, schemas } from "../middleware/validation.js"

const router = express.Router()

// Obtener todos los eventos
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT e.*, 
             COUNT(ea.id) as asistentes_count,
             CASE WHEN ea_user.user_id IS NOT NULL THEN true ELSE false END as user_registered
      FROM events e
      LEFT JOIN event_attendees ea ON e.id = ea.event_id
      LEFT JOIN event_attendees ea_user ON e.id = ea_user.event_id AND ea_user.user_id = $1
      GROUP BY e.id, ea_user.user_id
      ORDER BY e.fecha, e.hora
    `,
      [req.user.id],
    )

    res.json({
      success: true,
      data: {
        events: result.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Obtener evento por ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    const result = await query(
      `
      SELECT e.*, 
             COUNT(ea.id) as asistentes_count,
             CASE WHEN ea_user.user_id IS NOT NULL THEN true ELSE false END as user_registered
      FROM events e
      LEFT JOIN event_attendees ea ON e.id = ea.event_id
      LEFT JOIN event_attendees ea_user ON e.id = ea_user.event_id AND ea_user.user_id = $2
      WHERE e.id = $1
      GROUP BY e.id, ea_user.user_id
    `,
      [id, req.user.id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Evento no encontrado",
      })
    }

    res.json({
      success: true,
      data: {
        event: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Crear nuevo evento
router.post("/", authenticateToken, requireAdmin, validateRequest(schemas.event), async (req, res, next) => {
  try {
    const { titulo, descripcion, fecha, hora, lugar, cupo_maximo } = req.body

    const result = await query(
      "INSERT INTO events (titulo, descripcion, fecha, hora, lugar, cupo_maximo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [titulo, descripcion, fecha, hora, lugar, cupo_maximo],
    )

    res.status(201).json({
      success: true,
      message: "Evento creado exitosamente",
      data: {
        event: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Actualizar evento
router.put("/:id", authenticateToken, requireAdmin, validateRequest(schemas.event), async (req, res, next) => {
  try {
    const { id } = req.params
    const { titulo, descripcion, fecha, hora, lugar, cupo_maximo } = req.body

    const result = await query(
      "UPDATE events SET titulo = $1, descripcion = $2, fecha = $3, hora = $4, lugar = $5, cupo_maximo = $6 WHERE id = $7 RETURNING *",
      [titulo, descripcion, fecha, hora, lugar, cupo_maximo, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Evento no encontrado",
      })
    }

    res.json({
      success: true,
      message: "Evento actualizado exitosamente",
      data: {
        event: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Eliminar evento
router.delete("/:id", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params

    const result = await query("DELETE FROM events WHERE id = $1 RETURNING *", [id])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Evento no encontrado",
      })
    }

    res.json({
      success: true,
      message: "Evento eliminado exitosamente",
    })
  } catch (error) {
    next(error)
  }
})

// Registrarse a un evento
router.post("/:id/register", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    // Verificar que el evento existe
    const eventCheck = await query("SELECT cupo_maximo FROM events WHERE id = $1", [id])
    if (eventCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Evento no encontrado",
      })
    }

    // Verificar si ya está registrado
    const registrationCheck = await query("SELECT id FROM event_attendees WHERE user_id = $1 AND event_id = $2", [
      userId,
      id,
    ])

    if (registrationCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Ya estás registrado en este evento",
      })
    }

    // Verificar cupo disponible
    const attendeesCount = await query("SELECT COUNT(*) as count FROM event_attendees WHERE event_id = $1", [id])

    const cupoMaximo = Number.parseInt(eventCheck.rows[0].cupo_maximo)
    const asistentesActuales = Number.parseInt(attendeesCount.rows[0].count)

    if (asistentesActuales >= cupoMaximo) {
      return res.status(409).json({
        success: false,
        message: "El evento ha alcanzado su cupo máximo",
      })
    }

    // Registrar al usuario
    await query("INSERT INTO event_attendees (user_id, event_id) VALUES ($1, $2)", [userId, id])

    res.json({
      success: true,
      message: "Te has registrado exitosamente al evento",
    })
  } catch (error) {
    next(error)
  }
})

// Cancelar registro a evento
router.delete("/:id/register", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    const userId = req.user.id

    const result = await query("DELETE FROM event_attendees WHERE user_id = $1 AND event_id = $2 RETURNING *", [
      userId,
      id,
    ])

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No estás registrado en este evento",
      })
    }

    res.json({
      success: true,
      message: "Has cancelado tu registro al evento",
    })
  } catch (error) {
    next(error)
  }
})

// Obtener asistentes de un evento (solo admin)
router.get("/:id/attendees", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params

    const result = await query(
      `
      SELECT u.id, u.nombre, u.email, ea.created_at as fecha_registro
      FROM event_attendees ea
      JOIN users u ON ea.user_id = u.id
      WHERE ea.event_id = $1
      ORDER BY ea.created_at
    `,
      [id],
    )

    res.json({
      success: true,
      data: {
        attendees: result.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
