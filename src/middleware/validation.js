import { z } from "zod"

export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body)
      next()
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Datos de entrada inválidos",
        errors: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      })
    }
  }
}

export const schemas = {
  register: z.object({
    nombres: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    apellidos: z.string().min(2, "Los apellidos deben tener al menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
    dni: z
      .string()
      .min(7, "El DNI debe tener al menos 7 caracteres")
      .max(20, "El DNI no puede tener más de 20 caracteres")
      .regex(/^[0-9A-Za-z-]+$/, "El DNI solo puede contener números, letras y guiones"),
    telefono: z
      .string()
      .min(10, "El teléfono debe tener al menos 10 caracteres")
      .max(20, "El teléfono no puede tener más de 20 caracteres")
      .regex(/^[+]?[0-9\-\s$$$$]+$/, "Formato de teléfono inválido"),
    rol: z.enum(["cliente", "administrador"]).default("cliente"),
  }),

  login: z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(1, "Contraseña requerida"),
  }),

  room: z.object({
    numero: z.string().min(1, "Número de habitación requerido"),
    tipo: z.enum(["estándar", "doble", "triple", "matrimonial", "suite"], {
      errorMap: () => ({ message: "Tipo debe ser: estándar, doble, triple, matrimonial o suite" }),
    }),
    precio: z.number().positive("El precio debe ser positivo"),
    capacidad: z.number().int().positive("La capacidad debe ser un número positivo"),
    estado: z.enum(["disponible", "ocupada", "mantenimiento"]).default("disponible"),
  }),

  reservation: z.object({
    room_id: z.number().int().positive("ID de habitación requerido"),
    nombre_huesped: z.string().min(2, "Nombre del huésped requerido"),
    email_huesped: z.string().email("Email del huésped inválido"),
    telefono_huesped: z.string().min(10, "Teléfono del huésped requerido"),
    fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de inicio inválida"),
    fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de fin inválida"),
    notas: z.string().optional(),
  }),

  event: z.object({
    titulo: z.string().min(3, "El título debe tener al menos 3 caracteres"),
    descripcion: z.string().min(10, "La descripción debe tener al menos 10 caracteres"),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
    hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    lugar: z.string().min(3, "El lugar debe tener al menos 3 caracteres"),
    cupo_maximo: z.number().int().positive("El cupo máximo debe ser positivo"),
  }),

  updateProfile: z.object({
    nombres: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
    apellidos: z.string().min(2, "Los apellidos deben tener al menos 2 caracteres").optional(),
    dni: z
      .string()
      .min(7, "El DNI debe tener al menos 7 caracteres")
      .max(20, "El DNI no puede tener más de 20 caracteres")
      .regex(/^[0-9A-Za-z-]+$/, "El DNI solo puede contener números, letras y guiones")
      .optional(),
    telefono: z
      .string()
      .min(10, "El teléfono debe tener al menos 10 caracteres")
      .max(20, "El teléfono no puede tener más de 20 caracteres")
      .regex(/^[+]?[0-9\-\s$$$$]+$/, "Formato de teléfono inválido")
      .optional(),
  }),
}
