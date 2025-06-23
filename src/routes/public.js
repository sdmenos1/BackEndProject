import express from "express"
import { query } from "../config/database.js"

const router = express.Router()

// Obtener habitaciones disponibles (público)
router.get("/rooms", async (req, res, next) => {
  try {
    const result = await query(`
      SELECT r.id, r.numero, r.tipo, r.precio, r.capacidad,
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
      WHERE r.estado != 'mantenimiento'
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

// Obtener eventos públicos
router.get("/events", async (req, res, next) => {
  try {
    const result = await query(`
      SELECT e.*, 
             COUNT(ea.id) as asistentes_count,
             (e.cupo_maximo - COUNT(ea.id)) as cupos_disponibles
      FROM events e
      LEFT JOIN event_attendees ea ON e.id = ea.event_id
      WHERE e.fecha >= CURRENT_DATE
      GROUP BY e.id
      ORDER BY e.fecha, e.hora
    `)

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

// Verificar disponibilidad de habitación (público)
router.get("/rooms/:id/availability", async (req, res, next) => {
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

// Información general del hotel (público)
router.get("/hotel-info", async (req, res, next) => {
  try {
    // Estadísticas públicas
    const roomsResult = await query("SELECT COUNT(*) as total FROM rooms WHERE estado = 'disponible'")
    const eventsResult = await query(
      "SELECT COUNT(*) as total FROM events WHERE fecha >= CURRENT_DATE AND fecha <= CURRENT_DATE + INTERVAL '30 days'",
    )

    res.json({
      success: true,
      data: {
        totalRoomsAvailable: Number.parseInt(roomsResult.rows[0].total),
        upcomingEvents: Number.parseInt(eventsResult.rows[0].total),
        hotelName: "Hotel Paradise",
        description: "El mejor hotel para tu estadía perfecta",
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
