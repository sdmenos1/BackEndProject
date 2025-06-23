import express from "express"
import { query } from "../config/database.js"
import { authenticateToken, requireAdmin } from "../middleware/auth.js"

const router = express.Router()

// Dashboard con estadísticas generales
router.get("/dashboard", authenticateToken, async (req, res, next) => {
  try {
    // Total de habitaciones
    const totalRoomsResult = await query("SELECT COUNT(*) as count FROM rooms")
    const totalRooms = Number.parseInt(totalRoomsResult.rows[0].count)

    // Habitaciones disponibles
    const availableRoomsResult = await query(`
      SELECT COUNT(*) as count FROM rooms r
      WHERE r.estado = 'disponible'
      AND NOT EXISTS (
        SELECT 1 FROM reservations res 
        WHERE res.room_id = r.id 
        AND res.estado = 'confirmada' 
        AND CURRENT_DATE BETWEEN res.fecha_inicio AND res.fecha_fin
      )
    `)
    const availableRooms = Number.parseInt(availableRoomsResult.rows[0].count)

    // Reservas activas
    const activeReservationsResult = await query(`
      SELECT COUNT(*) as count FROM reservations 
      WHERE estado = 'confirmada' 
      AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
    `)
    const activeReservations = Number.parseInt(activeReservationsResult.rows[0].count)

    // Eventos próximos (próximos 30 días)
    const upcomingEventsResult = await query(`
      SELECT COUNT(*) as count FROM events 
      WHERE fecha BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
    `)
    const upcomingEvents = Number.parseInt(upcomingEventsResult.rows[0].count)

    // Ingresos del mes actual
    const monthlyRevenueResult = await query(`
      SELECT COALESCE(SUM(total), 0) as revenue FROM reservations 
      WHERE estado = 'confirmada' 
      AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `)
    const monthlyRevenue = Number.parseFloat(monthlyRevenueResult.rows[0].revenue)

    // Tasa de ocupación
    const occupancyRate = totalRooms > 0 ? Math.round(((totalRooms - availableRooms) / totalRooms) * 100) : 0

    res.json({
      success: true,
      data: {
        totalRooms,
        availableRooms,
        activeReservations,
        upcomingEvents,
        monthlyRevenue,
        occupancyRate,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Reporte de ingresos
router.get("/income", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { year, month } = req.query

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: "Año y mes son requeridos",
      })
    }

    // Ingresos totales del mes
    const totalIncomeResult = await query(
      `
      SELECT COALESCE(SUM(total), 0) as total_ingresos,
             COUNT(*) as total_reservas,
             COALESCE(AVG(total), 0) as promedio_reserva
      FROM reservations 
      WHERE estado = 'confirmada' 
      AND EXTRACT(MONTH FROM created_at) = $1
      AND EXTRACT(YEAR FROM created_at) = $2
    `,
      [month, year],
    )

    // Detalle de reservas del mes
    const reservationsDetailResult = await query(
      `
      SELECT r.*, ro.numero as room_numero
      FROM reservations r
      JOIN rooms ro ON r.room_id = ro.id
      WHERE r.estado = 'confirmada' 
      AND EXTRACT(MONTH FROM r.created_at) = $1
      AND EXTRACT(YEAR FROM r.created_at) = $2
      ORDER BY r.created_at DESC
    `,
      [month, year],
    )

    const stats = totalIncomeResult.rows[0]

    res.json({
      success: true,
      data: {
        totalIngresos: Number.parseFloat(stats.total_ingresos),
        totalReservas: Number.parseInt(stats.total_reservas),
        promedioReserva: Number.parseFloat(stats.promedio_reserva),
        detalleReservas: reservationsDetailResult.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Reporte de ocupación
router.get("/occupancy", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query

    // Si no se proporcionan fechas, usar el mes actual
    const fechaInicioQuery =
      fecha_inicio || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]
    const fechaFinQuery =
      fecha_fin || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0]

    // Habitaciones ocupadas
    const occupiedRoomsResult = await query(
      `
      SELECT COUNT(DISTINCT r.room_id) as count
      FROM reservations r
      WHERE r.estado = 'confirmada'
      AND (
        (r.fecha_inicio <= $1 AND r.fecha_fin >= $1) OR
        (r.fecha_inicio <= $2 AND r.fecha_fin >= $2) OR
        (r.fecha_inicio >= $1 AND r.fecha_fin <= $2)
      )
    `,
      [fechaInicioQuery, fechaFinQuery],
    )

    // Total de habitaciones
    const totalRoomsResult = await query("SELECT COUNT(*) as count FROM rooms")

    // Detalle de habitaciones con su estado actual
    const roomsDetailResult = await query(`
      SELECT r.numero, r.tipo, r.estado,
             res.nombre_huesped as huesped_actual
      FROM rooms r
      LEFT JOIN reservations res ON r.id = res.room_id 
        AND res.estado = 'confirmada'
        AND CURRENT_DATE BETWEEN res.fecha_inicio AND res.fecha_fin
      ORDER BY r.numero
    `)

    const habitacionesOcupadas = Number.parseInt(occupiedRoomsResult.rows[0].count)
    const totalHabitaciones = Number.parseInt(totalRoomsResult.rows[0].count)
    const habitacionesDisponibles = totalHabitaciones - habitacionesOcupadas
    const tasaOcupacion = totalHabitaciones > 0 ? Math.round((habitacionesOcupadas / totalHabitaciones) * 100) : 0

    res.json({
      success: true,
      data: {
        habitacionesOcupadas,
        habitacionesDisponibles,
        totalHabitaciones,
        tasaOcupacion,
        detalleHabitaciones: roomsDetailResult.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Reporte de eventos
router.get("/events", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const { year, month } = req.query

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: "Año y mes son requeridos",
      })
    }

    // Estadísticas generales de eventos
    const eventsStatsResult = await query(
      `
      SELECT COUNT(*) as total_eventos,
             COALESCE(SUM(cupo_maximo), 0) as total_cupos,
             COALESCE(AVG(cupo_maximo), 0) as promedio_cupo
      FROM events 
      WHERE EXTRACT(MONTH FROM fecha) = $1
      AND EXTRACT(YEAR FROM fecha) = $2
    `,
      [month, year],
    )

    // Total de asistentes
    const attendeesStatsResult = await query(
      `
      SELECT COUNT(*) as total_asistentes
      FROM event_attendees ea
      JOIN events e ON ea.event_id = e.id
      WHERE EXTRACT(MONTH FROM e.fecha) = $1
      AND EXTRACT(YEAR FROM e.fecha) = $2
    `,
      [month, year],
    )

    // Detalle de eventos con asistentes
    const eventsDetailResult = await query(
      `
      SELECT e.*, 
             COUNT(ea.id) as asistentes_count
      FROM events e
      LEFT JOIN event_attendees ea ON e.id = ea.event_id
      WHERE EXTRACT(MONTH FROM e.fecha) = $1
      AND EXTRACT(YEAR FROM e.fecha) = $2
      GROUP BY e.id
      ORDER BY e.fecha, e.hora
    `,
      [month, year],
    )

    const stats = eventsStatsResult.rows[0]
    const totalAsistentes = Number.parseInt(attendeesStatsResult.rows[0].total_asistentes)
    const totalCupos = Number.parseInt(stats.total_cupos)
    const promedioAsistencia = totalCupos > 0 ? Math.round((totalAsistentes / totalCupos) * 100) : 0

    res.json({
      success: true,
      data: {
        totalEventos: Number.parseInt(stats.total_eventos),
        totalAsistentes,
        promedioAsistencia,
        detalleEventos: eventsDetailResult.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
