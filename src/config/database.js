import pkg from "pg"
import dotenv from "dotenv"

dotenv.config()

const { Pool } = pkg

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
})

// Función para ejecutar queries
export const query = async (text, params) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log("📊 Query ejecutada:", { text, duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error("❌ Error en query:", error)
    throw error
  }
}

// Función para obtener un cliente de la pool
export const getClient = async () => {
  return await pool.connect()
}

// Función para cerrar la pool
export const closePool = async () => {
  await pool.end()
}

export default pool
