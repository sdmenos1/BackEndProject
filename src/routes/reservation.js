import express from "express"
import { query } from "../config/database.js"
import { authenticateToken, requireClientOrAdmin } from "../middleware/auth.js"
import { validateRequest, schemas } from "../middleware/validation.js"

const router = express.Router()

// Obtener reservas (admin ve todas, cliente solo las suyas)
router.get("/", authenticateToken, async (req, res, next) => {
  try {
    let queryText = `
      SELECT r.*, ro.numero as room_numero, ro.precio as room_precio, ro.tipo as room_tipo,
             u.nombre as user_nombre, u.email as user_email
      FROM reservations r
      JOIN rooms ro ON r.room_id = ro.id
      JOIN users u ON r.user_id = u.id
    `
    let queryParams = []

    // Si es cliente, solo ver sus propias reservas
    if (req.user.rol === "cliente") {
      queryText += " WHERE r.user_id = $1"
      queryParams = [req.user.id]
    }

    queryText += " ORDER BY r.created_at DESC"

    const result = await query(queryText, queryParams)

    res.json({
      success: true,
      data: {
        reservations: result.rows,
      },
    })
  } catch (error) {
    next(error)
  }
})

// Obtener reserva por ID
router.get("/:id", authenticateToken, async (req, res, next) => {
  try {
    const { id } = req.params
    let queryText = `
      SELECT r.*, ro.numero as room_numero, ro.precio as room_precio, ro.tipo as room_tipo,
             u.nombre as user_nombre, u.email as user_email
      FROM reservations r
      JOIN rooms ro ON r.room_id = ro.id
      JOIN users u ON r.user_id = u.id
      WHERE r.id = $1
    `
    const queryParams = [id]

    // Si es cliente, solo puede ver sus propias reservas
    if (req.user.rol === "cliente") {
      queryText += " AND r.user_id = $2"
      queryParams.push(req.user.id)
    }

    const result = await query(queryText, queryParams)

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reserva no encontrada",
      })
    }

    res.json({
      success: true,
      data: {
        reservation: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

// Crear nueva reserva (clientes y admins)
router.post(
  "/",
  authenticateToken,
  requireClientOrAdmin,
  validateRequest(schemas.reservation),
  async (req, res, next) => {
    try {
      const { room_id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, notas } = req.body

      // Verificar que la habitación existe y está disponible
      const roomCheck = await query("SELECT precio, estado FROM rooms WHERE id = $1", [room_id])
      if (roomCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Habitación no encontrada",
        })
      }

      if (roomCheck.rows[0].estado !== "disponible") {
        return res.status(400).json({
          success: false,
          message: "La habitación no está disponible",
        })
      }

      // Verificar disponibilidad en las fechas
      const availabilityCheck = await query(
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
        [room_id, fecha_inicio, fecha_fin],
      )

      if (Number.parseInt(availabilityCheck.rows[0].conflictos) > 0) {
        return res.status(409).json({
          success: false,
          message: "La habitación no está disponible en las fechas seleccionadas",
        })
      }

      // Calcular total
      const precio = Number.parseFloat(roomCheck.rows[0].precio)
      const fechaInicio = new Date(fecha_inicio)
      const fechaFin = new Date(fecha_fin)
      const dias = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24))
      const total = precio * dias

      // Crear reserva
      const result = await query(
        `
      INSERT INTO reservations (room_id, user_id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, total, notas)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
        [room_id, req.user.id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, total, notas],
      )

      res.status(201).json({
        success: true,
        message: "Reserva creada exitosamente",
        data: {
          reservation: result.rows[0],
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

// Actualizar reserva (solo propias reservas para clientes)
router.put(
  "/:id",
  authenticateToken,
  requireClientOrAdmin,
  validateRequest(schemas.reservation),
  async (req, res, next) => {
    try {
      const { id } = req.params
      const { room_id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, notas } = req.body

      // Verificar que la reserva existe y pertenece al usuario (si es cliente)
      let reservationCheck
      if (req.user.rol === "cliente") {
        reservationCheck = await query("SELECT * FROM reservations WHERE id = $1 AND user_id = $2", [id, req.user.id])
      } else {
        reservationCheck = await query("SELECT * FROM reservations WHERE id = $1", [id])
      }

      if (reservationCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Reserva no encontrada",
        })
      }

      // Verificar que la habitación existe
      const roomCheck = await query("SELECT precio FROM rooms WHERE id = $1", [room_id])
      if (roomCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Habitación no encontrada",
        })
      }

      // Verificar disponibilidad (excluyendo la reserva actual)
      const availabilityCheck = await query(
        `
      SELECT COUNT(*) as conflictos
      FROM reservations 
      WHERE room_id = $1 
      AND estado = 'confirmada'
      AND id != $4
      AND (
        (fecha_inicio <= $2 AND fecha_fin >= $2) OR
        (fecha_inicio <= $3 AND fecha_fin >= $3) OR
        (fecha_inicio >= $2 AND fecha_fin <= $3)
      )
    `,
        [room_id, fecha_inicio, fecha_fin, id],
      )

      if (Number.parseInt(availabilityCheck.rows[0].conflictos) > 0) {
        return res.status(409).json({
          success: false,
          message: "La habitación no está disponible en las fechas seleccionadas",
        })
      }

      // Calcular nuevo total
      const precio = Number.parseFloat(roomCheck.rows[0].precio)
      const fechaInicio = new Date(fecha_inicio)
      const fechaFin = new Date(fecha_fin)
      const dias = Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24))
      const total = precio * dias

      // Actualizar reserva
      const result = await query(
        `
      UPDATE reservations 
      SET room_id = $1, nombre_huesped = $2, email_huesped = $3, telefono_huesped = $4, 
          fecha_inicio = $5, fecha_fin = $6, total = $7, notas = $8
      WHERE id = $9
      RETURNING *
    `,
        [room_id, nombre_huesped, email_huesped, telefono_huesped, fecha_inicio, fecha_fin, total, notas, id],
      )

      res.json({
        success: true,
        message: "Reserva actualizada exitosamente",
        data: {
          reservation: result.rows[0],
        },
      })
    } catch (error) {
      next(error)
    }
  },
)

// Cancelar reserva (solo propias reservas para clientes)
router.delete("/:id", authenticateToken, requireClientOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params

    let queryText = "UPDATE reservations SET estado = $1 WHERE id = $2"
    const queryParams = ["cancelada", id]

    // Si es cliente, solo puede cancelar sus propias reservas
    if (req.user.rol === "cliente") {
      queryText += " AND user_id = $3"
      queryParams.push(req.user.id)
    }

    queryText += " RETURNING *"

    const result = await query(queryText, queryParams)

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Reserva no encontrada",
      })
    }

    res.json({
      success: true,
      message: "Reserva cancelada exitosamente",
      data: {
        reservation: result.rows[0],
      },
    })
  } catch (error) {
    next(error)
  }
})

export default router
